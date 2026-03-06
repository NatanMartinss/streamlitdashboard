import requests
import mysql.connector
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
import time
import argparse
from typing import List, Dict, Any, Optional

# ======================
# Configurações
# ======================
REPORT_URL = "https://api.doutoraovivo.com.br/report/appointment"
DETAIL_URL = "https://api.v2.doutoraovivo.com.br/appointment/"
PROTOCOL_URL = "https://api.v2.doutoraovivo.com.br/protocol"

DB_CONFIG = {
    "host": "bitcare_atend.mysql.dbaas.com.br",
    "user": "bitcare_atend",
    "password": "Bitcare#Prod20",
    "database": "bitcare_atend",
}

# Log básico
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)


# ======================
# Utilitários
# ======================
def parse_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    if dt_str:
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def to_utc_z(dt: datetime, end: bool = False) -> str:
    """
    Converte um datetime pensado em UTC-3 para UTC e formata com sufixo 'Z'.
    - início: 00:00:00.000Z
    - fim:    23:59:59.999Z
    """
    dt_utc = dt + timedelta(hours=3)
    if end:
        return dt_utc.strftime("%Y-%m-%dT23:59:59.999Z")
    return dt_utc.strftime("%Y-%m-%dT00:00:00.000Z")


def retry_request(method: str, url: str, max_retries: int = 5, base_delay: float = 1.0, **kwargs):
    """
    Requisição HTTP com retries e backoff exponencial simples.
    """
    # Se o caller passar timeout em kwargs, usamos o fornecido; caso contrário, default=60.
    request_timeout = kwargs.pop("timeout", 60)
    last_err = None
    for attempt in range(max_retries):
        try:
            resp = requests.request(method, url, timeout=request_timeout, **kwargs)
            resp.raise_for_status()
            return resp
        except Exception as e:
            last_err = e
            wait = (2 ** attempt) * base_delay
            logging.warning(
                f"HTTP falhou em {url} (tentativa {attempt + 1}/{max_retries}): {e}. aguardando {wait:.1f}s"
            )
            if attempt < max_retries - 1:
                time.sleep(wait)
    raise last_err


# ======================
# Polling de detalhes
# ======================
def poll_detail(appointment_id: str, headers: Dict[str, str], attempts: int = 5, delay: float = 1.0) -> Optional[Dict[str, Any]]:
    """Busca detalhes do appointment com até N tentativas e pequeno atraso.
    Considera completo quando há participantes, arquivos, ou metadados de descrição/razão/orientação/notas.
    """
    url = f"{DETAIL_URL}{appointment_id}"
    for i in range(attempts):
        try:
            resp = retry_request("GET", url, headers=headers, timeout=30)
            data = resp.json()
            # Usa heurística para decidir se está completo
            try:
                complete = _detail_is_complete(data)
            except Exception:
                # Fallback simples se função não estiver disponível por algum motivo
                participants = data.get("participants") or []
                files = data.get("files") or []
                meta_present = any(data.get(k) for k in ("description", "reason", "orientation", "notes"))
                complete = bool(participants) or bool(files) or meta_present

            if complete:
                return data
            logging.info(f"Detalhe ainda incompleto para {appointment_id} (tentativa {i+1}/{attempts})")
        except Exception as e:
            logging.warning(f"Falha ao ler detalhe {appointment_id} (tentativa {i+1}/{attempts}): {e}")
        time.sleep(delay * (i + 1))
    return None


# ======================
# Banco: Empresas Ativas
# ======================
def get_active_companies() -> List[Dict[str, Any]]:
    """
    Retorna empresas com api_key ativa. Considera opcionalmente coluna is_active.
    """
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    companies: List[Dict[str, Any]] = []
    try:
        try:
            cursor.execute(
                """
                SELECT id, api_key, name
                FROM companies
                WHERE api_key IS NOT NULL AND api_key <> ''
                  AND (is_active = 1 OR is_active IS NULL)
                """
            )
        except Exception:
            cursor.execute(
                "SELECT id, api_key, name FROM companies WHERE api_key IS NOT NULL AND api_key <> ''"
            )
        for row in cursor.fetchall():
            companies.append({"id": row[0], "api_key": row[1], "name": row[2]})
    finally:
        cursor.close()
        conn.close()
    return companies


# ======================
# Coleta de Protocolos
# ======================
def fetch_protocols_for_company(
    start_date: datetime,
    end_date: datetime,
    api_key: str,
    days_per_request: int = 35,
) -> List[Dict[str, Any]]:
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }
    all_items: List[Dict[str, Any]] = []
    current_start = start_date

    while current_start <= end_date:
        current_finish = current_start + timedelta(days=days_per_request - 1)
        if current_finish > end_date:
            current_finish = end_date

        params = {
            "date_from": to_utc_z(current_start, end=False),
            "date_to": to_utc_z(current_finish, end=True),
        }

        logging.info(
            f"Coletando protocolos: {params['date_from']} .. {params['date_to']}"
        )

        # 1) Paginação por header x-exclusive-start-key
        next_key = None
        used_header_pagination = False
        page_total = 0
        while True:
            call_headers = dict(headers)
            if next_key:
                call_headers["x-exclusive-start-key"] = next_key
            try:
                resp = retry_request("GET", PROTOCOL_URL, headers=call_headers, params=params)
                data = resp.json()
                # Pode retornar lista de protocolos ou um objeto
                page_items = data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])
                count = len(page_items)
                all_items.extend(page_items)
                page_total += count

                hdr_next_key = resp.headers.get("x-exclusive-start-key")
                body_next_key = data.get("next_key") if isinstance(data, dict) else None
                next_key = hdr_next_key or body_next_key
                if next_key:
                    used_header_pagination = True
                if not next_key or count == 0:
                    break
            except Exception as e:
                logging.warning(f"Falha na paginação por header (protocol): {e}")
                break

        # 2) Fallback: paginação por página
        if not used_header_pagination:
            limit = 500
            page = 1
            while True:
                params_page = dict(params)
                params_page.update({"page": page, "pageSize": limit, "limit": limit})
                try:
                    resp = retry_request("GET", PROTOCOL_URL, headers=headers, params=params_page)
                    data = resp.json()
                    page_items = data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])
                    count = len(page_items)
                    all_items.extend(page_items)
                    page_total += count
                    if count < limit:
                        break
                    page += 1
                except Exception as e:
                    logging.error(f"Erro no fallback de paginação (protocol): {e}")
                    break

        logging.info(f"Intervalo de protocolos coletado: {page_total} registros")
        current_start = current_finish + timedelta(days=1)

    logging.info(f"Total de protocolos coletados: {len(all_items)}")
    return all_items


def insert_protocol_events(protocols: List[Dict[str, Any]], company_id: int, company_key: str, company_name: Optional[str] = None) -> int:
    """
    Insere registros em protocol_events a partir dos objetos de protocolo.
    Faz dedupe básico por (protocol, event, timestamp).
    """
    inserted = 0
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # Helper para checar existência
    def exists(protocol: Optional[str], event: Optional[str], ts: Optional[datetime]) -> bool:
        if not protocol or not event or not ts:
            return False
        cursor.execute(
            "SELECT 1 FROM protocol_events WHERE protocol=%s AND event=%s AND timestamp=%s",
            (protocol, event, ts),
        )
        return cursor.fetchone() is not None

    try:
        for proto in protocols:
            protocol_code = proto.get("protocol")
            person = proto.get("person") or {}
            person_id = person.get("id")
            person_name = person.get("name")
            person_reg = person.get("registration")
            arrival = parse_datetime(person.get("arrival"))
            start_att = parse_datetime(proto.get("start_attendance"))
            reason_finished = proto.get("reason_finished")

            # 1) arrival como evento
            if arrival and not exists(protocol_code, "FLOW_PERSON_ARRIVAL", arrival):
                cursor.execute(
                    (
                        """
                        INSERT INTO protocol_events (
                            company_id, company_key, company_name,
                            protocol, appointment_id, participant_id, cpf, name,
                            event, next_group, professional_id, professional_name, professional_license,
                            timestamp, payload
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """
                    ),
                    (
                        company_id,
                        company_key,
                        company_name,
                        protocol_code,
                        None,
                        person_id,
                        None,
                        person_name,
                        "FLOW_PERSON_ARRIVAL",
                        None,
                        None,
                        None,
                        None,
                        arrival,
                        None,
                    ),
                )
                inserted += 1

            # 2) start_attendance como evento
            if start_att and not exists(protocol_code, "FLOW_START_ATTENDANCE", start_att):
                cursor.execute(
                    (
                        """
                        INSERT INTO protocol_events (
                            company_id, company_key, company_name,
                            protocol, appointment_id, participant_id, cpf, name,
                            event, next_group, professional_id, professional_name, professional_license,
                            timestamp, payload
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """
                    ),
                    (
                        company_id,
                        company_key,
                        company_name,
                        protocol_code,
                        None,
                        person_id,
                        None,
                        person_name,
                        "FLOW_START_ATTENDANCE",
                        None,
                        None,
                        None,
                        None,
                        start_att,
                        None,
                    ),
                )
                inserted += 1

            # 3) history -> eventos detalhados
            history = proto.get("history") or []
            for h in history:
                ts = parse_datetime(h.get("ts"))
                step = h.get("step")
                info = h.get("info") or {}
                appointment_id = info.get("appointment_id")
                next_group = h.get("next_group")
                prof_id = info.get("professional_id")
                prof_name = info.get("professional_name")
                prof_crm = info.get("professional_crm") or info.get("license_number")

                if ts and step and not exists(protocol_code, step, ts):
                    cursor.execute(
                        (
                            """
                            INSERT INTO protocol_events (
                                company_id, company_key, company_name,
                                protocol, appointment_id, participant_id, cpf, name,
                                event, next_group, professional_id, professional_name, professional_license,
                                timestamp, payload
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """
                        ),
                        (
                            company_id,
                            company_key,
                            company_name,
                            protocol_code,
                            appointment_id,
                            person_id,
                            None,
                            person_name,
                            step,
                            next_group,
                            prof_id,
                            prof_name,
                            prof_crm,
                            ts,
                            None,
                        ),
                    )
                    inserted += 1

        conn.commit()
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

    logging.info(f"Protocol events inseridos: {inserted}")
    return inserted

# ======================
# Coleta de Appointments
# ======================
def fetch_appointments_for_company(
    start_date: datetime,
    end_date: datetime,
    api_key: str,
    days_per_request: int = 21,
    use_fallback: bool = True,
    max_pages: int = 200,
) -> List[Dict[str, Any]]:
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }
    all_items: List[Dict[str, Any]] = []
    seen_ids: set = set()
    total_t0 = time.time()
    current_start = start_date

    while current_start <= end_date:
        current_finish = current_start + timedelta(days=days_per_request - 1)
        if current_finish > end_date:
            current_finish = end_date

        params = {
            "schedule_start_range_start": to_utc_z(current_start, end=False),
            "schedule_start_range_finish": to_utc_z(current_finish, end=True),
            "schedule_status": "REA",
            "status": "true",
        }

        logging.info(
            f"Coletando appointments: {params['schedule_start_range_start']} .. {params['schedule_start_range_finish']}"
        )
        print(
            f" Buscando appointments de {params['schedule_start_range_start']} até {params['schedule_start_range_finish']}"
        )
        rng_t0 = time.time()

        # 1) Paginação por header x-exclusive-start-key
        next_key = None
        used_header_pagination = False
        page_total = 0
        header_pages = 0
        while True:
            call_headers = dict(headers)
            if next_key:
                call_headers["x-exclusive-start-key"] = next_key
            try:
                resp = retry_request("GET", REPORT_URL, headers=call_headers, params=params)
                data = resp.json()
                page_items = data if isinstance(data, list) else data.get("items") or data.get("appointments") or []
                # Dedup: adiciona apenas IDs novos
                added = 0
                for it in page_items:
                    iid = it.get("id")
                    if iid is None or iid not in seen_ids:
                        all_items.append(it)
                        if iid is not None:
                            seen_ids.add(iid)
                        added += 1
                count = len(page_items)
                page_total += added
                print(f" {count} registros retornados nesta página.")

                hdr_next_key = resp.headers.get("x-exclusive-start-key")
                body_next_key = data.get("next_key") if isinstance(data, dict) else None
                next_key = hdr_next_key or body_next_key
                if next_key:
                    used_header_pagination = True
                if not next_key or count == 0:
                    break
                header_pages += 1
                if header_pages >= max_pages:
                    logging.warning("Limite de páginas atingido na paginação por header; interrompendo intervalo atual.")
                    break
            except Exception as e:
                logging.warning(f"Falha na paginação por header: {e}")
                break

        # 2) Fallback: paginação por página (opcional)
        if (not used_header_pagination) and use_fallback:
            limit = 500
            page = 1
            while True:
                params_page = dict(params)
                params_page.update({"page": page, "pageSize": limit, "limit": limit})
                try:
                    resp = retry_request("GET", REPORT_URL, headers=headers, params=params_page)
                    data = resp.json()
                    page_items = data if isinstance(data, list) else data.get("items") or data.get("appointments") or []
                    # Dedup: adiciona apenas IDs novos
                    added = 0
                    for it in page_items:
                        iid = it.get("id")
                        if iid is None or iid not in seen_ids:
                            all_items.append(it)
                            if iid is not None:
                                seen_ids.add(iid)
                            added += 1
                    count = len(page_items)
                    page_total += added
                    print(f" {added} registros adicionados nesta página (fallback).")
                    if count < limit:
                        break
                    page += 1
                    if page > max_pages:
                        logging.warning("Limite de páginas atingido na paginação fallback; interrompendo intervalo atual.")
                        break
                except Exception as e:
                    logging.error(f"Erro no fallback de paginação: {e}")
                    break
        rng_elapsed = time.time() - rng_t0
        mode = "header" if used_header_pagination else "fallback"
        logging.info(f"Intervalo coletado: {page_total} registros (modo={mode}, {rng_elapsed:.1f}s)")
        print(f" Total do intervalo atual: {page_total} appointments | modo={mode} | tempo={rng_elapsed:.2f}s")
        current_start = current_finish + timedelta(days=1)

    total_elapsed = time.time() - total_t0
    logging.info(f"Total coletado: {len(all_items)} appointments em {total_elapsed:.1f}s")
    return all_items


# ======================
# Inserts no Banco
# ======================
def fetch_existing_keys(cursor, table: str, key_column: str, keys: List[Any]) -> set:
    if not keys:
        return set()
    placeholders = ",".join(["%s"] * len(keys))
    query = f"SELECT {key_column} FROM {table} WHERE {key_column} IN ({placeholders})"
    cursor.execute(query, tuple(keys))
    return {row[0] for row in cursor.fetchall()}


def insert_appointments_batch(appointments: List[Dict[str, Any]], company_id: int, batch_size: int = 500) -> int:
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    insert_query = (
        """
        INSERT INTO appointments (
            id, company_id, status_appointment, appointment_specialty,
            schedule_date_time, executed_date_time, total_appointment_time,
            cid10_code, cid10_category, cid10_subcategory, cid10_value
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
    )

    batch: List[tuple] = []
    ids: List[str] = []
    total_inserted = 0

    for appt in appointments:
        total_time = (appt.get("summary") or {}).get("appointment_time", 0)
        cid10 = appt.get("cid10") or {}
        vals = (
            appt.get("id"),
            company_id,
            appt.get("status_appointment"),
            appt.get("appointment_specialty"),
            parse_datetime(appt.get("schedule_date_time")),
            parse_datetime(appt.get("executed_date_time")),
            total_time,
            cid10.get("code", ""),
            cid10.get("category", ""),
            cid10.get("subcategory", ""),
            cid10.get("value", ""),
        )
        batch.append(vals)
        ids.append(vals[0])

        if len(batch) >= batch_size:
            existing = fetch_existing_keys(cursor, "appointments", "id", ids)
            final_batch = [r for r in batch if r[0] not in existing]
            if final_batch:
                cursor.executemany(insert_query, final_batch)
                conn.commit()
                total_inserted += cursor.rowcount
            batch.clear()
            ids.clear()

    if batch:
        existing = fetch_existing_keys(cursor, "appointments", "id", ids)
        final_batch = [r for r in batch if r[0] not in existing]
        if final_batch:
            cursor.executemany(insert_query, final_batch)
            conn.commit()
            total_inserted += cursor.rowcount

    cursor.close()
    conn.close()
    logging.info(f"Appointments inseridos: {total_inserted}")
    return total_inserted


def process_details_for_company(company_id: int, api_key: str, max_workers: int = 3):
    """
    Busca detalhes por appointment_id (não detalhados) e insere:
    - appointment_details
    - appointment_participants
    - files
    Marca appointment como detailed=1.
    """
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }

    # Carrega ids a detalhar
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT id FROM appointments WHERE company_id = %s AND (detailed IS NULL OR detailed <> 1)",
        (company_id,),
    )
    ids = [row["id"] for row in cursor.fetchall()]
    cursor.close()
    conn.close()

    logging.info(f"{len(ids)} appointments para detalhar (company_id={company_id})")
    if not ids:
        return

    def process_id(appt_id: str) -> str:
        try:
            # Polling de 5 tentativas para cada consulta (detalhe)
            data = poll_detail(appt_id, headers=headers, attempts=5, delay=1.0)
            if not data:
                return f"ERR:{appt_id}"

            # Conexão dedicada por tarefa
            conn_local = mysql.connector.connect(**DB_CONFIG)
            cursor_local = conn_local.cursor()

            try:
                # appointment_details
                participants = data.get("participants") or []
                time_in_appointment = None
                for p in participants:
                    if p.get("role") == "MMD":
                        time_in_appointment = p.get("time_in_appointment")
                        break

                cursor_local.execute(
                    (
                        """
                        INSERT INTO appointment_details (
                            appointment_id, company_id, description, reason, orientation, notes, resume_total_time
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                            description=VALUES(description),
                            reason=VALUES(reason),
                            orientation=VALUES(orientation),
                            notes=VALUES(notes),
                            resume_total_time=VALUES(resume_total_time)
                        """
                    ),
                    (
                        appt_id,
                        company_id,
                        data.get("description"),
                        data.get("reason"),
                        data.get("orientation"),
                        data.get("notes"),
                        time_in_appointment,
                    ),
                )

                # files
                files = data.get("files") or []
                for f in files:
                    file_date = parse_datetime(f.get("date"))
                    cursor_local.execute(
                        (
                            """
                            INSERT INTO files (
                                appointment_id, company_id, file_date, encoded, file_path, name_original, participant
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE file_path=VALUES(file_path)
                            """
                        ),
                        (
                            appt_id,
                            company_id,
                            file_date,
                            f.get("encoded"),
                            f.get("filePath"),
                            f.get("nameOriginal"),
                            f.get("participant"),
                        ),
                    )

                # appointment_participants
                insert_part = (
                    """
                    INSERT INTO appointment_participants (
                        appointment_id, company_id, cpf, name, role,
                        start_date_time, end_date_time,
                        council_type, council_number, council_region
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                )
                # Evita duplicata por (appointment_id, cpf)
                for p in participants:
                    council = p.get("council") or {}
                    vals = (
                        appt_id,
                        company_id,
                        p.get("cpf"),
                        p.get("name"),
                        p.get("role"),
                        parse_datetime(p.get("start")),
                        parse_datetime(p.get("end")),
                        council.get("type"),
                        council.get("number"),
                        council.get("region"),
                    )

                    # checa existência
                    cursor_local.execute(
                        "SELECT 1 FROM appointment_participants WHERE appointment_id=%s AND cpf=%s",
                        (appt_id, p.get("cpf")),
                    )
                    exists = cursor_local.fetchone()
                    if not exists:
                        cursor_local.execute(insert_part, vals)

                # Marca detailed
                cursor_local.execute("UPDATE appointments SET detailed = 1 WHERE id = %s", (appt_id,))
                conn_local.commit()
            finally:
                try:
                    cursor_local.close()
                except Exception:
                    pass
                try:
                    conn_local.close()
                except Exception:
                    pass

            return appt_id

        except Exception as e:
            logging.error(f"Falha ao detalhar {appt_id}: {e}")
            return f"ERR:{appt_id}"

    # Executa com concorrência controlada
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(process_id, appt_id) for appt_id in ids]
        for fut in as_completed(futures):
            _ = fut.result()


# ======================
# Main
# ======================
def main():
    parser = argparse.ArgumentParser(description="Cron multi-empresa: coleta appointments e detalhes")
    parser.add_argument("--from", dest="date_from", help="Data inicial (YYYY-MM-DD)")
    parser.add_argument("--to", dest="date_to", help="Data final (YYYY-MM-DD)")
    parser.add_argument("--days-per-request", type=int, default=21, help="Dias por requisição na coleta de appointments")
    parser.add_argument("--max-workers-details", type=int, default=3, help="Concorrência para detalhamento")
    parser.add_argument("--with-protocol", action="store_true", help="Coletar e inserir protocolos no período")
    parser.add_argument("--no-fallback", action="store_true", help="Desativa a paginação fallback por página na coleta de appointments")
    args = parser.parse_args()

    # Define janela de datas
    if args.date_from and args.date_to:
        start_date = datetime.strptime(args.date_from, "%Y-%m-%d")
        end_date = datetime.strptime(args.date_to, "%Y-%m-%d")
    else:
        # Padrão: últimos 50 dias (pensado em UTC-3)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=50)

    companies = get_active_companies()
    logging.info(f"Empresas ativas: {len(companies)}")

    for comp in companies:
        company_id = comp["id"]
        api_key = comp["api_key"]
        name = comp.get("name") or str(company_id)
        logging.info(f"==== Empresa: {name} (id={company_id}) ====")

        # 1) Coleta appointments
        appointments = fetch_appointments_for_company(
            start_date,
            end_date,
            api_key,
            args.days_per_request,
            use_fallback=(not args.no_fallback),
            max_pages=200,
        )
        # 2) Insere appointments
        inserted = insert_appointments_batch(appointments, company_id)
        logging.info(f"Empresa {name}: {inserted} appointments inseridos.")
        # 3) Detalhes + participants + files
        process_details_for_company(company_id, api_key, args.max_workers_details)
        logging.info(f"Empresa {name}: detalhamento concluído.")

        # 4) Protocolos (opcional)
        if args.with_protocol:
            protocols = fetch_protocols_for_company(start_date, end_date, api_key, args.days_per_request)
            inserted_proto = insert_protocol_events(protocols, company_id, api_key, name)
            logging.info(f"Empresa {name}: {inserted_proto} eventos de protocolo inseridos.")


if __name__ == "__main__":
    main()
def _detail_is_complete(data: Dict[str, Any]) -> bool:
    """Heurística simples para decidir se o detalhe está completo.
    Considera completo se possuir qualquer um dos blocos relevantes:
    - participants (lista não-vazia)
    - files (lista não-vazia)
    - description/reason/orientation/notes presentes
    """
    try:
        participants = data.get("participants") or []
        files = data.get("files") or []
        meta_fields = [data.get("description"), data.get("reason"), data.get("orientation"), data.get("notes")]
        if participants and len(participants) > 0:
            return True
        if files and len(files) > 0:
            return True
        if any(v for v in meta_fields):
            return True
        return False
    except Exception:
        return False

def poll_detail(appt_id: str, headers: Dict[str, str], attempts: int = 5, delay: float = 1.0) -> Optional[Dict[str, Any]]:
    """Polling do detalhe de uma consulta.
    Faz até `attempts` tentativas para obter um JSON válido e "completo".
    Usa retry_request em cada tentativa e espera `delay` (com pequeno backoff) entre elas.
    """
    url = f"{DETAIL_URL}{appt_id}"
    last_err: Optional[Exception] = None
    for i in range(attempts):
        try:
            resp = retry_request("GET", url, headers=headers, max_retries=5, base_delay=delay)
            try:
                data = resp.json()
            except Exception as je:
                last_err = je
                logging.warning(f"Detalhe {appt_id}: JSON inválido (tentativa {i+1}/{attempts}): {je}")
                if i < attempts - 1:
                    time.sleep(delay * (i + 1))
                continue

            if _detail_is_complete(data):
                return data

            logging.info(f"Detalhe {appt_id} incompleto (tentativa {i+1}/{attempts}); aguardando para reconsultar...")
            if i < attempts - 1:
                time.sleep(delay * (i + 1))
        except Exception as e:
            last_err = e
            logging.warning(f"Falha ao obter detalhe {appt_id} (tentativa {i+1}/{attempts}): {e}")
            if i < attempts - 1:
                time.sleep(delay * (i + 1))

    if last_err:
        logging.error(f"Polling de detalhe falhou para {appt_id}: {last_err}")
    return None