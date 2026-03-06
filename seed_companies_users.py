import re
import sys
import argparse
import secrets
from datetime import datetime
import mysql.connector
import bcrypt

# DB config — usa o mesmo banco do cron.py
DB_CONFIG = {
    "host": "bitcare_atend.mysql.dbaas.com.br",
    "user": "bitcare_atend",
    "password": "Bitcare#Prod20",
    "database": "bitcare_atend",
}

# Fonte: lista enviada pelo usuário (deduplicaremos por api_key)
RAW_COMPANIES = [
    {
        "cnpj": "67.844.845/0001-34",
        "razaoSocial": "Ecco Salva Servicos Medicos de Emergencia Ltda",
        "nomeFantasia": "ECCOSALVA EMERGENCIAS MEDICAS",
        "website": "eccosalvatelemedicina.dav.med.br",
        "status": "ATIVO",
        "api_key": "Kk1kpn4PfH55PgC2X2kDa61iUFRLHeTO2MF09D1G",
        "email": "admin@eccosalva.com.br",
    },
    {
        "cnpj": "51.385.252/0001-17",
        "razaoSocial": "teste",
        "nomeFantasia": "teste",
        "website": "",
        "status": "ATIVO",
        # mesmo api_key da Ecco — será ignorado na deduplicação
        "api_key": "Kk1kpn4PfH55PgC2X2kDa61iUFRLHeTO2MF09D1G",
        "email": None,
    },
    {
        "cnpj": "05.498.875/0001-89",
        "razaoSocial": "QualiSalva Serviços Médicos",
        "nomeFantasia": "Qualisalva Serviços Médicos",
        "website": "qualisalvatelemedicina.dav.med.br",
        "status": "ATIVO",
        "api_key": "5qkbTgmDLa1nPXafJ4fxz9ZR4xXUscGK5N99BX8Y",
        "email": None,
    },
    {
        "cnpj": "74.175.951/0001-38",
        "razaoSocial": "Dez Serviços e Emergências",
        "nomeFantasia": "Dez Emergências",
        "website": "dezemergencias.dav.med.br",
        "status": "ATIVO",
        "api_key": "iAMJ6JeUpE8OTPDcmt2YO17FmgqOXzDt7WpKohCz",
        "email": None,
    },
    {
        "cnpj": "92.741.016/0001-73",
        "razaoSocial": "Associacao dos Funcionarios Publicos do Estado do Rio Grande do Sul",
        "nomeFantasia": "Verte Saude - Afpergs",
        "website": "vertesaude.dav.med.br",
        "status": "ATIVO",
        "api_key": "qucGDNjy983y7vZFq94hy6Y3Nf9cBYPG9WeZNKrg",
        "email": None,
    },
    {
        "cnpj": "73.318.677/0001-46",
        "razaoSocial": "UNILUTUS PRESTADORA DE SERVICOS E ADMINISTRACAO LTDA",
        "nomeFantasia": "Uniassist Telemedicina",
        "website": "uniassis",
        "status": "ATIVO",
        "api_key": "9WNZoFrx703c7ZwG2vd0La2N9N4yLkIS7UrAuWVH",
        "email": None,
    },
    {
        "cnpj": "00.091.238/0001-70",
        "razaoSocial": "Instituto de Seguridade dos Servidores Municipais",
        "nomeFantasia": "ISSEM",
        "website": "telemedicina.issem.com.br",
        "status": "ATIVO",
        "api_key": "zQ1v3sy06AwQwEsmyUYo6bzzoQawEiu47SCAWea5",
        "email": None,
    },
]


def slugify(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "company"


def pick_email(company) -> str:
    # Usa email fornecido se existir
    if company.get("email"):
        return company["email"]
    domain = company.get("website") or slugify(company.get("nomeFantasia") or company.get("razaoSocial")) + ".local"
    if not re.search(r"\.", domain):
        domain = slugify(domain) + ".local"
    return f"admin@{domain}"


def dedupe_by_api_key(raw_list):
    seen = {}
    for c in raw_list:
        k = c.get("api_key")
        if not k:
            # ignora sem api_key
            continue
        # mantém o primeiro (mais completo) — Ecco vs teste
        if k not in seen:
            seen[k] = c
    return list(seen.values())


def ensure_company(conn, company, default_secret: str, verbose=False) -> int:
    cursor = conn.cursor()
    name = company.get("nomeFantasia") or company.get("razaoSocial") or "Empresa"
    email = pick_email(company)
    api_key = company.get("api_key")
    api_secret = default_secret or secrets.token_hex(16)
    is_active = 1 if (company.get("status") or "").upper() == "ATIVO" else 0
    cnpj = company.get("cnpj")
    address = None
    phone = None
    url_webhook = None

    insert = (
        """
        INSERT INTO companies (
            name, cnpj, email, phone, address, api_key, api_secret, is_active, url_webhook
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            email = VALUES(email),
            phone = VALUES(phone),
            address = VALUES(address),
            is_active = VALUES(is_active),
            url_webhook = VALUES(url_webhook)
        """
    )
    cursor.execute(
        insert,
        (name, cnpj, email, phone, address, api_key, api_secret, is_active, url_webhook),
    )
    conn.commit()

    # recupera id pelo api_key
    cursor.execute("SELECT id FROM companies WHERE api_key=%s", (api_key,))
    row = cursor.fetchone()
    cursor.close()
    if not row:
        raise RuntimeError(f"Falha ao obter company.id para api_key={api_key}")
    if verbose:
        print(f"Empresa '{name}' pronta (id={row[0]}, email={email}, ativa={is_active})")
    return int(row[0])


def ensure_admin_user(conn, company_id: int, company_name: str, admin_email: str, password: str, verbose=False):
    cursor = conn.cursor()
    username = f"admin_{slugify(company_name)}"
    full_name = f"Administrador {company_name}"
    role = "admin"
    is_active = 1
    # gera hash bcrypt (custos semelhantes ao exemplo do banco)
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

    insert = (
        """
        INSERT INTO users (
            company_id, username, email, password_hash, full_name, role, is_active
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            full_name = VALUES(full_name),
            role = VALUES(role),
            is_active = VALUES(is_active)
        """
    )
    cursor.execute(
        insert,
        (company_id, username, admin_email, hashed, full_name, role, is_active),
    )
    conn.commit()
    cursor.close()
    if verbose:
        print(f"Usuário admin criado/atualizado (company_id={company_id}, username={username}, email={admin_email})")


def main():
    parser = argparse.ArgumentParser(description="Seed de empresas e usuários admin.")
    parser.add_argument("--password", default="TroqueMe123!", help="Senha padrão para os admins criados.")
    parser.add_argument("--secret", default="", help="api_secret padrão (gera aleatório se vazio).")
    parser.add_argument("--verbose", action="store_true", help="Mostra logs detalhados.")
    args = parser.parse_args()

    companies = dedupe_by_api_key(RAW_COMPANIES)
    if args.verbose:
        print(f"Total de empresas após dedupe: {len(companies)}")

    conn = mysql.connector.connect(**DB_CONFIG)
    try:
        for c in companies:
            name = c.get("nomeFantasia") or c.get("razaoSocial") or "Empresa"
            comp_id = ensure_company(conn, c, args.secret, verbose=args.verbose)
            admin_email = pick_email(c)
            ensure_admin_user(conn, comp_id, name, admin_email, args.password, verbose=args.verbose)

        # resumo
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id, name, api_key, email, is_active FROM companies ORDER BY id")
        rows = cur.fetchall()
        print("\nResumo companies:")
        for r in rows:
            print(f" - id={r['id']} name={r['name']} email={r['email']} ativa={r['is_active']} api_key={r['api_key'][:8]}...")

        cur.execute("SELECT id, company_id, username, email, role, is_active FROM users ORDER BY id")
        users = cur.fetchall()
        print("\nResumo users:")
        for u in users:
            print(f" - id={u['id']} company_id={u['company_id']} username={u['username']} email={u['email']} role={u['role']}")
        cur.close()
    finally:
        conn.close()


if __name__ == "__main__":
    main()