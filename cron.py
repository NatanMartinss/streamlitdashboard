import json
import requests
import mysql.connector
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
import threading
import time
import random
import argparse

#########################
# CONFIGURAÇÕES
#########################

# API_KEY opcional (não usado em modo multi-empresa);
API_KEY = ''
REPORT_URL = 'https://api.doutoraovivo.com.br/report/appointment'
DETAIL_URL = 'https://api.v2.doutoraovivo.com.br/appointment/'
PROTOCOL_URL = "https://api.v2.doutoraovivo.com.br/protocol"

# HEADERS padrão vazio; será definido por empresa na execução
HEADERS = {
    'Content-Type': 'application/json'
}

DB_CONFIG = {
    "host": "bitcare_atend.mysql.dbaas.com.br",
    "user": "bitcare_atend",
    "password": "Bitcare#Prod20",
    "database": "bitcare_atend"
}

# Ajuste o período padrão (últimos dias a buscar)
DEFAULT_DAYS_BACK = 50

#########################
# LOGGER
#########################
logging.basicConfig(
    filename=r'C:\Users\Lustennierr Skvazenn\Desktop\job cron\job_diario.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

lock = threading.Lock()

#########################
# UTILS
#########################
def parse_datetime(dt_str):
    if dt_str:
        try:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except:
            return None
    return None


# Pequeno helper de retries para GET com backoff exponencial
def retry_get(url, params=None, headers=None, timeout=30, max_retries=5, backoff=1.5):
    last_exc = None
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            resp.raise_for_status()
            return resp
        except requests.exceptions.RequestException as e:
            last_exc = e
            wait = backoff ** attempt
            logging.warning(f" Falha GET {url} (tentativa {attempt+1}/{max_retries}): {e}. Aguardando {wait:.1f}s")
            time.sleep(wait)
    # Última tentativa sem raise_for_status para logar corpo, depois relançar
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=timeout)
        resp.raise_for_status()
        return resp
    except Exception:
        raise last_exc if last_exc else Exception("Falha em retry_get sem exceção original")


def get_company_id(cursor, api_key):
    """Busca o company_id correspondente à API_KEY."""
    cursor.execute("SELECT id FROM companies WHERE api_key = %s", (api_key,))
    row = cursor.fetchone()
    if not row:
        raise Exception("Empresa com essa API_KEY não encontrada no banco.")
    return row[0]


def get_active_companies(db_config):
    """Retorna empresas com api_key definida (opcionalmente filtra is_active quando disponível)."""
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()
    companies = []
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

#########################
# 1️⃣ BUSCA DA API
#########################
def fetch_appointments_from_api(start_date, end_date, days_per_request=30, headers=None):
    def _iso_z(dt: datetime, end=False) -> str:
        # start_date/end_date são calculados em UTC-3; converter para UTC antes de formatar com 'Z'
        dt_utc = dt + timedelta(hours=3)
        if end:
            return dt_utc.strftime('%Y-%m-%dT23:59:59.999Z')
        return dt_utc.strftime('%Y-%m-%dT00:00:00.000Z')

    all_appointments = []
    current_start = start_date
    req_headers = headers or HEADERS

    while current_start <= end_date:
        current_finish = current_start + timedelta(days=days_per_request - 1)
        if current_finish > end_date:
            current_finish = end_date

        params = {
            "schedule_start_range_start": _iso_z(current_start, end=False),
            "schedule_start_range_finish": _iso_z(current_finish, end=True),
            "schedule_status": "REA",
            "status": "true"
        }

        page_total = 0
        used_header_pagination = False
        interval_t0 = time.time()
        max_pages = 200  # limite defensivo para evitar loops infinitos

        # 1) Tenta paginação via header x-exclusive-start-key
        next_key = None
        header_iter = 0
        while True:
            call_headers = dict(req_headers)
            if next_key:
                call_headers['x-exclusive-start-key'] = next_key
            try:
                print(
                    f" Buscando appointments de {params['schedule_start_range_start']} até {params['schedule_start_range_finish']}"
                    + (f" | next_key={next_key}" if next_key else "")
                )
                resp = retry_get(REPORT_URL, params=params, headers=call_headers, timeout=60, max_retries=5, backoff=1.5)
                resp.raise_for_status()
                data = resp.json()
                page_items = data if isinstance(data, list) else data.get('items') or data.get('appointments') or []
                count = len(page_items)
                all_appointments.extend(page_items)
                page_total += count
                print(f" {count} registros retornados nesta página.")

                hdr_next_key = resp.headers.get('x-exclusive-start-key')
                body_next_key = data.get('next_key') if isinstance(data, dict) else None
                next_key = hdr_next_key or body_next_key
                if next_key:
                    used_header_pagination = True
                if not next_key or count == 0:
                    break
                header_iter += 1
                if header_iter >= max_pages:
                    logging.warning(" Limite de páginas atingido na paginação por header; interrompendo intervalo atual.")
                    break
            except requests.HTTPError as e:
                resp_e = getattr(e, 'response', None)
                status = resp_e.status_code if resp_e is not None else None
                body = resp_e.text[:2000] if resp_e is not None and hasattr(resp_e, 'text') else str(e)
                logging.error(f" Erro HTTP ao buscar appointments: status={status} | body={body}")
                print(f" Erro HTTP ao buscar appointments: {status} | body (parcial)={body[:500]}")
                break
            except Exception as e:
                logging.error(f" Erro ao buscar appointments: {e}")
                print(f" Erro ao buscar appointments: {e}")
                break

        # 2) Fallback: paginação por página se não houve header next_key
        if not used_header_pagination:
            limit = 500
            page = 1
            while True:
                params_page = dict(params)
                params_page.update({
                    'page': page,
                    'pageSize': limit,
                    'limit': limit,
                })
                try:
                    t0 = time.time()
                    print(f" Buscando (fallback) página {page} | {params_page['schedule_start_range_start']}..{params_page['schedule_start_range_finish']}")
                    resp = retry_get(REPORT_URL, params=params_page, headers=req_headers, timeout=60, max_retries=5, backoff=1.5)
                    resp.raise_for_status()
                    data = resp.json()
                    page_items = data if isinstance(data, list) else data.get('items') or data.get('appointments') or []
                    count = len(page_items)
                    all_appointments.extend(page_items)
                    page_total += count
                    elapsed = time.time() - t0
                    print(f" {count} registros retornados nesta página (fallback) em {elapsed:.2f}s.")
                    if count < limit:
                        break
                    page += 1
                    if page > max_pages:
                        logging.warning(" Limite de páginas atingido na paginação fallback; interrompendo intervalo atual.")
                        break
                except requests.HTTPError as e:
                    resp_e = getattr(e, 'response', None)
                    status = resp_e.status_code if resp_e is not None else None
                    body = resp_e.text[:2000] if resp_e is not None and hasattr(resp_e, 'text') else str(e)
                    logging.error(f" Erro HTTP ao buscar appointments (fallback): status={status} | body={body}")
                    print(f" Erro HTTP ao buscar appointments (fallback): {status} | body (parcial)={body[:500]}")
                    break
                except Exception as e:
                    logging.error(f" Erro ao buscar appointments (fallback): {e}")
                    print(f" Erro ao buscar appointments (fallback): {e}")
                    break
        interval_elapsed = time.time() - interval_t0
        print(f" Total do intervalo atual: {page_total} appointments | modo={'header' if used_header_pagination else 'fallback'} | tempo={interval_elapsed:.2f}s")
        current_start = current_finish + timedelta(days=1)

    print(f" Total coletado: {len(all_appointments)} appointments.")
    return all_appointments

#########################
# 2️⃣ INSERTS NO BANCO
#########################
def fetch_existing_keys(cursor, table, key_column, keys):
    if not keys:
        return set()
    placeholders = ','.join(['%s'] * len(keys))
    query = f"SELECT {key_column} FROM {table} WHERE {key_column} IN ({placeholders})"
    cursor.execute(query, tuple(keys))
    return {row[0] for row in cursor.fetchall()}


def insert_appointments_batch(appointments, db_config, company_id, batch_size=500):
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()
    insert_query = """
    INSERT INTO appointments (
        id, company_id, status_appointment, appointment_specialty,
        schedule_date_time, executed_date_time, total_appointment_time,
        cid10_code, cid10_category, cid10_subcategory, cid10_value
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    batch, ids = [], []
    total_inserted = 0

    for appt in appointments:
        total_time = appt.get("summary", {}).get("appointment_time", 0)
        cid10 = appt.get("cid10", {})
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
            cid10.get("value", "")
        )
        batch.append(vals)
        ids.append(vals[0])

        if len(batch) >= batch_size:
            existing = fetch_existing_keys(cursor, 'appointments', 'id', ids)
            final_batch = [r for r in batch if r[0] not in existing]
            if final_batch:
                cursor.executemany(insert_query, final_batch)
                conn.commit()
                total_inserted += cursor.rowcount
            batch.clear()
            ids.clear()

    if batch:
        existing = fetch_existing_keys(cursor, 'appointments', 'id', ids)
        final_batch = [r for r in batch if r[0] not in existing]
        if final_batch:
            cursor.executemany(insert_query, final_batch)
            conn.commit()
            total_inserted += cursor.rowcount

    cursor.close()
    conn.close()
    print(f" Total appointments inseridos: {total_inserted}")


def insert_participants_batch(appointments, db_config, company_id, batch_size=500):
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()
    insert_query = """
    INSERT INTO appointment_participants (
        appointment_id, company_id, cpf, name, role,
        start_date_time, end_date_time,
        council_type, council_number, council_region
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    batch, keys = [], []
    total_inserted = 0

    for appt in appointments:
        for p in appt.get("participants", []):
            council = p.get("council", {})
            key = (appt.get("id"), p.get("cpf"))
            vals = (
                key[0],
                company_id,
                key[1],
                p.get("name"),
                p.get("role"),
                parse_datetime(p.get("start")),
                parse_datetime(p.get("end")),
                council.get("type"),
                council.get("number"),
                council.get("region")
            )
            batch.append(vals)
            keys.append(key)

            if len(batch) >= batch_size:
                placeholders = ','.join(['(%s, %s)'] * len(keys))
                flat = [item for tup in keys for item in tup]
                select = f"SELECT appointment_id, cpf FROM appointment_participants WHERE (appointment_id, cpf) IN ({placeholders})"
                cursor.execute(select, tuple(flat))
                existing = {(row[0], row[1]) for row in cursor.fetchall()}

                final_batch = [r for r, k in zip(batch, keys) if k not in existing]
                if final_batch:
                    cursor.executemany(insert_query, final_batch)
                    conn.commit()
                    total_inserted += cursor.rowcount
                batch.clear()
                keys.clear()

    if batch:
        placeholders = ','.join(['(%s, %s)'] * len(keys))
        flat = [item for tup in keys for item in tup]
        select = f"SELECT appointment_id, cpf FROM appointment_participants WHERE (appointment_id, cpf) IN ({placeholders})"
        cursor.execute(select, tuple(flat))
        existing = {(row[0], row[1]) for row in cursor.fetchall()}
        final_batch = [r for r, k in zip(batch, keys) if k not in existing]
        if final_batch:
            cursor.executemany(insert_query, final_batch)
            conn.commit()
            total_inserted += cursor.rowcount

    cursor.close()
    conn.close()
    print(f" Total participants inseridos: {total_inserted}")

#########################
# 3️⃣ DETALHAMENTO
#########################
def process_detailed_ids(db_config, company_id, headers=None):
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        # Processar somente appointments da empresa atual e ignorar detailed=1
        cursor.execute(
            "SELECT id FROM appointments WHERE company_id = %s AND (detailed IS NULL OR detailed <> 1)",
            (company_id,)
        )
        ids = [row['id'] for row in cursor.fetchall()]
        print(f" {len(ids)} appointments para detalhar.")
        req_headers = headers or HEADERS

        # Limita concorrência e adiciona retries com backoff para evitar 500
        max_workers_details = 3  # reduzir pressão no endpoint
        max_retries = 5
        base_backoff = 1.0

        def process_id(id):
            url = f"{DETAIL_URL}{id}"
            for attempt in range(max_retries):
                try:
                    resp = requests.get(url, headers=req_headers, timeout=30)
                    status = resp.status_code
                    if status == 200:
                        try:
                            data = resp.json()
                        except Exception as je:
                            logging.error(f" JSON inválido no ID {id}: {je} | body={resp.text[:500]}")
                            return f" Erro ID {id}: JSON inválido"

                        with lock:
                            # Abrimos conexão local por tarefa para evitar 2055 em conexões compartilhadas
                            conn_local = None
                            cursor_local = None
                            try:
                                conn_local = mysql.connector.connect(**db_config)
                                cursor_local = conn_local.cursor()

                                # Insert details
                                participants = data.get("participants", [])
                                time_in_appointment = next((p.get("time_in_appointment") for p in participants if p.get("role") == "MMD"), None)
                                cursor_local.execute(
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
                                    """,
                                    (
                                        id,
                                        company_id,
                                        data.get('description'),
                                        data.get('reason'),
                                        data.get('orientation'),
                                        data.get('notes'),
                                        time_in_appointment
                                    )
                                )

                                # Insert files
                                files = data.get('files', [])
                                for file in files:
                                    file_date = parse_datetime(file.get('date'))
                                    cursor_local.execute(
                                        """
                                        INSERT INTO files (
                                            appointment_id, company_id, file_date, encoded, file_path, name_original, participant
                                        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                                        ON DUPLICATE KEY UPDATE file_path=VALUES(file_path)
                                        """,
                                        (
                                            id,
                                            company_id,
                                            file_date,
                                            file.get('encoded'),
                                            file.get('filePath'),
                                            file.get('nameOriginal'),
                                            file.get('participant')
                                        )
                                    )

                                # Mark detailed
                                cursor_local.execute("UPDATE appointments SET detailed = 1 WHERE id = %s", (id,))
                                conn_local.commit()

                            except mysql.connector.Error as db_err:
                                logging.error(f" Erro DB no ID {id}: {db_err}")
                                # Tenta uma vez reabrir e gravar novamente
                                try:
                                    time.sleep(1)
                                    if cursor_local:
                                        try:
                                            cursor_local.close()
                                        except:
                                            pass
                                    if conn_local:
                                        try:
                                            conn_local.close()
                                        except:
                                            pass
                                    conn_local = mysql.connector.connect(**db_config)
                                    cursor_local = conn_local.cursor()

                                    # Reexecuta inserts com os mesmos dados
                                    participants = data.get("participants", [])
                                    time_in_appointment = next((p.get("time_in_appointment") for p in participants if p.get("role") == "MMD"), None)
                                    cursor_local.execute(
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
                                        """,
                                        (
                                            id,
                                            company_id,
                                            data.get('description'),
                                            data.get('reason'),
                                            data.get('orientation'),
                                            data.get('notes'),
                                            time_in_appointment
                                        )
                                    )
                                    files = data.get('files', [])
                                    for file in files:
                                        file_date = parse_datetime(file.get('date'))
                                        cursor_local.execute(
                                            """
                                            INSERT INTO files (
                                                appointment_id, company_id, file_date, encoded, file_path, name_original, participant
                                            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                                            ON DUPLICATE KEY UPDATE file_path=VALUES(file_path)
                                            """,
                                            (
                                                id,
                                                company_id,
                                                file_date,
                                                file.get('encoded'),
                                                file.get('filePath'),
                                                file.get('nameOriginal'),
                                                file.get('participant')
                                            )
                                        )
                                    cursor_local.execute("UPDATE appointments SET detailed = 1 WHERE id = %s", (id,))
                                    conn_local.commit()
                                except Exception as db_err2:
                                    logging.error(f" Erro DB (retry) no ID {id}: {db_err2}")
                                    return f" Erro DB ID {id}: {db_err2}"
                            finally:
                                try:
                                    if cursor_local:
                                        cursor_local.close()
                                except:
                                    pass
                                try:
                                    if conn_local:
                                        conn_local.close()
                                except:
                                    pass

                        return f" ID {id} processado."

                    # Status não-200: log e decidir retry
                    body_text = resp.text if hasattr(resp, 'text') else ''
                    body_snippet = body_text[:2000]
                    if status >= 500:
                        logging.error(f" DAV 500 no ID {id}: status={status} | tent {attempt+1}/{max_retries} | url={url} | body={body_snippet}")
                        print(f" DAV 500 corpo (parcial) ID {id}: {body_text[:500]}")
                    else:
                        logging.warning(f" Falha ID {id}: {status} | tent {attempt+1}/{max_retries} | body={body_snippet}")

                    # Apenas re-tenta em 5xx, 429, 408; demais casos retorna
                    if status >= 500 or status in (429, 408):
                        backoff = min(60, (base_backoff * (2 ** attempt)) + random.uniform(0, 0.5))
                        time.sleep(backoff)
                        continue
                    else:
                        return f" Falha ID {id}: {status}"

                except requests.RequestException as re:
                    logging.error(f" Erro de rede no ID {id}: {re} | tent {attempt+1}/{max_retries}")
                    backoff = min(60, (base_backoff * (2 ** attempt)) + random.uniform(0, 0.5))
                    time.sleep(backoff)
                    continue
                except Exception as e:
                    logging.error(f" Erro no ID {id}: {e}")
                    return f" Erro ID {id}: {e}"

            # esgotou retries
            return f" Falha ID {id}: 500 após {max_retries} tentativas"

        # Reduzimos a concorrência para evitar picos
        workers = min(max_workers_details, max(1, len(ids)))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(process_id, id) for id in ids]
            for future in as_completed(futures):
                print(future.result())

        cursor.close()
        conn.close()
        print("\n Detalhamento completo.\n")
    except Exception as e:
        print(f" Erro conectando ao banco para detalhar: {e}")

#########################
# 4️⃣ PROTOCOLS
#########################
def fetch_protocols_from_api(start_date, end_date, headers=None):
    def _iso_z(dt: datetime) -> str:
        return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    items = []
    next_key = None
    req_headers = dict(headers or HEADERS)
    while True:
        params = {
            "date_from": _iso_z(start_date),
            "date_to": _iso_z(end_date),
        }
        call_headers = dict(req_headers)
        if next_key:
            call_headers['x-exclusive-start-key'] = next_key
        try:
            print(f" Buscando protocolos de {params['date_from']} até {params['date_to']}" + (f" | next_key={next_key}" if next_key else ""))
            resp = requests.get(PROTOCOL_URL, params=params, headers=call_headers, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            page_items = data if isinstance(data, list) else data.get('items') or data.get('protocols') or []
            items.extend(page_items)
            print(f" {len(page_items)} protocolos retornados.")
            next_key = resp.headers.get('x-exclusive-start-key') or (data.get('next_key') if isinstance(data, dict) else None)
            if not next_key or not page_items:
                break
        except requests.HTTPError as e:
            resp = getattr(e, 'response', None)
            status = resp.status_code if resp is not None else None
            body = resp.text[:2000] if resp is not None and hasattr(resp, 'text') else str(e)
            logging.error(f" Erro HTTP ao buscar protocolos: status={status} | body={body}")
            print(f" Erro HTTP ao buscar protocolos: {status} | body (parcial)={body[:500]}")
            break
        except Exception as e:
            logging.error(f" Erro ao buscar protocolos: {e}")
            print(f" Erro ao buscar protocolos: {e}")
            break
    print(f" Total protocolos coletados: {len(items)}")
    return items


def insert_protocols(protocols, db_config, company_id, batch_size=200):
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    insert_protocol = """
    INSERT INTO protocols (
        protocol_code, company_id, person_id, person_name, person_registration,
        arrival_time, start_attendance, reason_finished
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        person_name=VALUES(person_name),
        person_registration=VALUES(person_registration),
        arrival_time=VALUES(arrival_time),
        start_attendance=VALUES(start_attendance),
        reason_finished=VALUES(reason_finished)
    """

    insert_history = """
    INSERT INTO protocol_history (
        protocol_id, ts, step, next_group,
        professional_id, professional_name, professional_crm,
        person_present, professional_present, appointment_id,
        notes, complaint, place_in_line, raw_json
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    total_protocols, total_history, ignored = 0, 0, 0

    for proto in protocols:
        protocol_code = proto.get("protocol")
        person = proto.get("person") or {}
        person_id = person.get("id")

        # Ignora protocolos inválidos
        if not protocol_code:
            logging.warning("Protocolo sem código foi ignorado.")
            ignored += 1
            continue
        if not person_id:
            logging.warning(f"Protocolo {protocol_code} ignorado (sem person_id).")
            ignored += 1
            continue

        vals = (
            protocol_code,
            company_id,
            person_id,
            person.get("name"),
            person.get("registration"),
            parse_datetime(person.get("arrival")),
            parse_datetime(proto.get("start_attendance")),
            proto.get("reason_finished")
        )

        try:
            cursor.execute(insert_protocol, vals)
            total_protocols += 1

            # Recupera o ID real
            cursor.execute("SELECT id FROM protocols WHERE protocol_code=%s", (protocol_code,))
            row = cursor.fetchone()
            if not row:
                logging.warning(f"Protocolo {protocol_code} não encontrado após insert.")
                continue
            protocol_id = row[0]

            # Histórico
            for h in proto.get("history", []):
                info = h.get("info", {})
                vals_hist = (
                    protocol_id,
                    parse_datetime(h.get("ts")),
                    h.get("step"),
                    h.get("next_group"),
                    info.get("professional_id"),
                    info.get("professional_name"),
                    info.get("professional_crm"),
                    1 if info.get("person_present") else 0,
                    1 if info.get("professional_present") else 0,
                    info.get("appointment_id"),
                    info.get("notes"),
                    info.get("complaint"),
                    info.get("place_in_line"),
                    json.dumps(h)
                )
                cursor.execute(insert_history, vals_hist)
                total_history += 1

        except Exception as e:
            logging.error(f"Erro ao inserir protocolo {protocol_code}: {e}")
            continue

    conn.commit()
    cursor.close()
    conn.close()

    print(f" Protocolos inseridos/atualizados: {total_protocols}")
    print(f" Históricos inseridos: {total_history}")
    print(f" Protocolos ignorados: {ignored}")


#########################
# 5️⃣ MAIN
#########################
if __name__ == "__main__":
    print("\n INICIANDO JOB DIÁRIO (multi-empresa)\n")

    parser = argparse.ArgumentParser(description="Cron multi-empresa: coleta appointments, detalhes e protocolos")
    parser.add_argument("--from", dest="date_from", help="Data inicial (YYYY-MM-DD)")
    parser.add_argument("--to", dest="date_to", help="Data final (YYYY-MM-DD)")
    parser.add_argument("--days-per-request", dest="days_per_request", type=int, default=30, help="Dias por requisição na coleta de appointments")
    args = parser.parse_args()

    if args.date_from and args.date_to:
        start_date = datetime.strptime(args.date_from, "%Y-%m-%d")
        end_date = datetime.strptime(args.date_to, "%Y-%m-%d")
    else:
        now_utc = datetime.utcnow()
        today_utc3 = now_utc + timedelta(hours=-3)  # UTC-3
        today_utc3_midnight = today_utc3.replace(hour=0, minute=0, second=0, microsecond=0)

        start_date = today_utc3_midnight - timedelta(days=DEFAULT_DAYS_BACK)
        end_date = today_utc3_midnight

    print(f" Período: {start_date} até {end_date}\n")

    # Carrega empresas ativas com api_key
    companies = get_active_companies(DB_CONFIG)
    if not companies:
        print("Nenhuma empresa ativa com api_key encontrada.")
        logging.info("Nenhuma empresa ativa com api_key encontrada.")
    else:
        print(f" Empresas a processar: {len(companies)}\n")

    # Processa empresas em paralelo para acelerar
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def run_company(company):
        company_id = company["id"]
        company_name = company.get("name") or f"ID {company_id}"
        api_key = company["api_key"]
        headers = {
            'x-api-key': api_key,
            'Content-Type': 'application/json'
        }
        print(f" Iniciando empresa {company_name} (id={company_id})")
        # 1. Appointments
        appointments = fetch_appointments_from_api(start_date, end_date, days_per_request=args.days_per_request, headers=headers)
        if appointments:
            insert_appointments_batch(appointments, DB_CONFIG, company_id)
            insert_participants_batch(appointments, DB_CONFIG, company_id)
        else:
            print(f" Empresa {company_name}: nenhum appointment retornado da API.")
        # 2. Detalhamento
        process_detailed_ids(DB_CONFIG, company_id, headers=headers)
        # 3. Protocolos
        protocols = fetch_protocols_from_api(start_date, end_date, headers=headers)
        if protocols:
            insert_protocols(protocols, DB_CONFIG, company_id)
        else:
            print(f" Empresa {company_name}: nenhum protocolo retornado da API.")
        print(f" Empresa {company_name} concluída.\n")

    max_workers = min(5, len(companies)) if companies else 0
    if max_workers > 0:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(run_company, c) for c in companies]
            for f in as_completed(futures):
                _ = f.result()

    print("\n JOB COMPLETO (todas as empresas)!\n")