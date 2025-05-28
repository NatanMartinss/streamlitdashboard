import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, timedelta
from sqlalchemy import create_engine

from sidebar import mostrar_pagina, seletor_de_datas
st.set_page_config(page_title="Dashboard Principal", page_icon="📊")

mostrar_pagina("Dados Comparativos")
start_date, end_date = seletor_de_datas()

# 🎯 Função para pegar início e fim do mês
def get_month_range(target_date):
    first_day = target_date.replace(day=1)
    next_month = (first_day + timedelta(days=32)).replace(day=1)
    last_day = next_month - timedelta(days=1)
    return first_day.date(), last_day.date()

# 📅 Datas úteis
hoje = datetime.today()
primeiro_dia_atual, ultimo_dia_atual = get_month_range(hoje)
primeiro_dia_passado, ultimo_dia_passado = get_month_range(hoje.replace(day=1) - timedelta(days=1))

# 🧩 Conectar ao banco
secrets = st.secrets["connections"]["mysql"]
engine = create_engine(f"mysql+pymysql://{secrets.user}:{secrets.password}@{secrets.host}:{secrets.port}/{secrets.database}")

# Título da Página
st.title("📊 Comparativo Mensal")
st.write(f"Períodos comparados: **{primeiro_dia_passado} a {ultimo_dia_passado}** vs **{primeiro_dia_atual} a {ultimo_dia_atual}**")

# 🚀 Consultas SQL
def get_data(query):
    return pd.read_sql(query, engine)

# 1️⃣ Número de atendimentos médicos
query_med = f"""
SELECT 
    'mês passado' as periodo, COUNT(*) as quantidade
FROM appointments
WHERE appointment_specialty != 'Confirmação de Dados'
  AND DATE(schedule_date_time) BETWEEN '{primeiro_dia_passado}' AND '{ultimo_dia_passado}'
UNION ALL
SELECT 
    'mês atual', COUNT(*) as quantidade
FROM appointments
WHERE appointment_specialty != 'Confirmação de Dados'
  AND DATE(schedule_date_time) BETWEEN '{primeiro_dia_atual}' AND '{ultimo_dia_atual}'
"""
df_med = get_data(query_med)
st.subheader("📌 Número de Atendimentos Médicos")
st.bar_chart(df_med.set_index("periodo")["quantidade"])

# 2️⃣ Consultas por hora (com filtro)
query_hora = f"""
SELECT HOUR(executed_date_time) as hora, 
       COUNT(CASE WHEN DATE(executed_date_time) BETWEEN '{primeiro_dia_passado}' AND '{ultimo_dia_passado}' THEN 1 END) as mes_passado,
       COUNT(CASE WHEN DATE(executed_date_time) BETWEEN '{primeiro_dia_atual}' AND '{ultimo_dia_atual}' THEN 1 END) as mes_atual
FROM appointments
WHERE executed_date_time IS NOT NULL
  AND appointment_specialty != 'Confirmação de Dados'
GROUP BY hora
ORDER BY hora
"""
df_hora = get_data(query_hora)
st.subheader("⏰ Consultas por Hora do Dia")
fig_hora = px.line(df_hora, x="hora", y=["mes_passado", "mes_atual"], labels={"value": "Consultas", "hora": "Hora"}, markers=True)
st.plotly_chart(fig_hora)

# 3️⃣ Consultas por dia da semana (com filtro)
query_dia_semana = f"""
SELECT 
    DAYOFWEEK(executed_date_time) as dia,
    COUNT(CASE WHEN DATE(executed_date_time) BETWEEN '{primeiro_dia_passado}' AND '{ultimo_dia_passado}' THEN 1 END) as mes_passado,
    COUNT(CASE WHEN DATE(executed_date_time) BETWEEN '{primeiro_dia_atual}' AND '{ultimo_dia_atual}' THEN 1 END) as mes_atual
FROM appointments
WHERE executed_date_time IS NOT NULL
  AND appointment_specialty != 'Confirmação de Dados'
GROUP BY dia
ORDER BY dia
"""
df_semana = get_data(query_dia_semana)
dias_map = {1: "Dom", 2: "Seg", 3: "Ter", 4: "Qua", 5: "Qui", 6: "Sex", 7: "Sáb"}
df_semana["dia"] = df_semana["dia"].map(dias_map)

st.subheader("📆 Consultas por Dia da Semana")
fig_semana = px.bar(df_semana, x="dia", y=["mes_passado", "mes_atual"], barmode="group", labels={"value": "Consultas", "dia": "Dia da Semana"})
st.plotly_chart(fig_semana)

# 4️⃣ Receitas emitidas (com filtro)
query_receitas = f"""
SELECT 'mês passado' as periodo, COUNT(*) as quantidade
FROM files f
JOIN appointments a ON f.appointment_id = a.id
WHERE LOWER(f.name_original) LIKE '%%receita%%'
  AND a.appointment_specialty != 'Confirmação de Dados'
  AND DATE(a.schedule_date_time) BETWEEN '{primeiro_dia_passado}' AND '{ultimo_dia_passado}'
UNION ALL
SELECT 'mês atual', COUNT(*) as quantidade
FROM files f
JOIN appointments a ON f.appointment_id = a.id
WHERE LOWER(f.name_original) LIKE '%%receita%%'
  AND a.appointment_specialty != 'Confirmação de Dados'
  AND DATE(a.schedule_date_time) BETWEEN '{primeiro_dia_atual}' AND '{ultimo_dia_atual}'
"""
df_receitas = get_data(query_receitas)
st.subheader("💊 Receitas Emitidas")
st.bar_chart(df_receitas.set_index("periodo")["quantidade"])

# 5️⃣ Atestados emitidos (com filtro)
query_atestados = f"""
SELECT 'mês passado' as periodo, COUNT(*) as quantidade
FROM files f
JOIN appointments a ON f.appointment_id = a.id
WHERE LOWER(f.name_original) LIKE '%%atestado%%'
  AND a.appointment_specialty != 'Confirmação de Dados'
  AND DATE(a.schedule_date_time) BETWEEN '{primeiro_dia_passado}' AND '{ultimo_dia_passado}'
UNION ALL
SELECT 'mês atual', COUNT(*) as quantidade
FROM files f
JOIN appointments a ON f.appointment_id = a.id
WHERE LOWER(f.name_original) LIKE '%%atestado%%'
  AND a.appointment_specialty != 'Confirmação de Dados'
  AND DATE(a.schedule_date_time) BETWEEN '{primeiro_dia_atual}' AND '{ultimo_dia_atual}'
"""
df_atestados = get_data(query_atestados)
st.subheader("📝 Atestados Emitidos")
st.bar_chart(df_atestados.set_index("periodo")["quantidade"])
