import streamlit as st
import pandas as pd
import pymysql
from sqlalchemy import create_engine
import plotly.express as px
from datetime import datetime, timedelta
import plotly.express as px
import datetime as dt
from sidebar import mostrar_pagina, seletor_de_datas

mostrar_pagina("Dashboard Principal")
start_date, end_date = seletor_de_datas()

start_formatado = start_date.strftime("%d/%m/%Y")
end_formatado = end_date.strftime("%d/%m/%Y")

st.title("📊 Dashboard Principal")
st.write(f"Período selecionado: {start_formatado} a {end_formatado}")

# 📦 Conexão com o banco (ajuste com seus dados)
secrets = st.secrets["connections"]["mysql"]
engine = create_engine(f"mysql+pymysql://{secrets.user}:{secrets.password}@{secrets.host}:{secrets.port}/{secrets.database}")




# ✅ Query usando parâmetros nomeados (evita injeção de SQL)
kpi_query = """
    SELECT
    (SELECT COUNT(*) FROM appointments WHERE appointment_specialty = 'Confirmação de Dados' AND DATE(CONVERT_TZ(schedule_date_time, '+00:00', '-03:00')) BETWEEN %s AND %s) AS confirmacoes,
    (SELECT COUNT(*) FROM appointments WHERE appointment_specialty != 'Confirmação de Dados' AND DATE(CONVERT_TZ(schedule_date_time, '+00:00', '-03:00')) BETWEEN %s AND %s) AS medicos,
    (SELECT COUNT(*) 
     FROM files f
     JOIN appointments a ON f.appointment_id = a.id
     WHERE LOWER(f.name_original) LIKE '%%atestado%%' 
       AND DATE(a.schedule_date_time) BETWEEN %s AND %s) AS atestados,
    (SELECT COUNT(*) 
     FROM files f
     JOIN appointments a ON f.appointment_id = a.id
     WHERE LOWER(f.name_original) LIKE '%%receita%%'
       AND DATE(a.schedule_date_time) BETWEEN %s AND %s) AS receitas,
    (SELECT ROUND(AVG(total_appointment_time)) FROM appointments WHERE appointment_specialty = 'Confirmação de Dados' AND DATE(CONVERT_TZ(schedule_date_time, '+00:00', '-03:00')) BETWEEN %s AND %s) AS tempo_medio_helpdesk,
    (SELECT ROUND(AVG(total_appointment_time)) FROM appointments WHERE appointment_specialty != 'Confirmação de Dados' AND DATE(CONVERT_TZ(schedule_date_time, '+00:00', '-03:00')) BETWEEN %s AND %s) AS tempo_medio_medico

"""

params = (
    start_date, end_date,  # confirmacoes
    start_date, end_date,  # medicos
    start_date, end_date,  # atestados (via appointments.schedule_date_time)
    start_date, end_date,  # receitas (via appointments.schedule_date_time)
    start_date, end_date,  # tempo médio helpdesk
    start_date, end_date   # tempo médio médico
)



kpis = pd.read_sql(kpi_query, engine, params=params)

# 🔢 Mostrar KPIs
help_secs = int(kpis['tempo_medio_helpdesk'][0] or 0)
med_secs = int(kpis['tempo_medio_medico'][0] or 0)
help_fmt = str(timedelta(seconds=help_secs))
med_fmt = str(timedelta(seconds=med_secs))
    

col1, col2, col3 = st.columns(3)
col1.metric("Confirmações de Dados", int(kpis['confirmacoes'][0]))
col2.metric("Atendimentos Médicos", int(kpis['medicos'][0]))
col3.metric("Atestados Emitidos", int(kpis['atestados'][0]))

col4, col5, col6 = st.columns(3)
col4.metric("Receitas Emitidas", int(kpis['receitas'][0]))
col5.metric("Tempo Médio de Atendimento HelpDesk", help_fmt)
col6.metric("Tempo Médio Atendimento Médico", med_fmt)

query = f"""
SELECT ap.id as appointment_id, ap.appointment_specialty, ap.schedule_date_time,
       pa.name, pa.role
FROM appointments ap
JOIN appointment_participants pa ON ap.id = pa.appointment_id
WHERE pa.role = 'mmd'
  AND pa.name NOT LIKE '%%Elisia%%'
  AND ap.appointment_specialty != 'confirmação de dados'
  AND DATE(ap.schedule_date_time) BETWEEN '{start_date}' AND '{end_date}'
"""


# 📊 Gráfico de barras


df = pd.read_sql(query, engine)
df['name'] = df['name'].apply(lambda x: x.strip().split()[0].capitalize())

if df.empty:
    st.warning("Nenhum dado encontrado para esse intervalo.")
else:
    df_grouped = df.groupby('name').size().reset_index(name='quantidade')
    df_grouped = df_grouped.sort_values(by='quantidade', ascending=False)
    df_top = df_grouped.head(10)

    fig = px.bar(
        df_top,
        x='name',
        y='quantidade',
        text_auto=True,
        labels={'name': 'Participante', 'quantidade': 'Atendimentos'},
        title="Atendimentos por médico"
    )

    st.plotly_chart(fig)



query2 = f"""
SELECT ap.cid10_value, COUNT(*) as quantidade
FROM appointments ap
JOIN appointment_participants pa ON ap.id = pa.appointment_id
WHERE pa.role = 'mmd'
  AND ap.appointment_specialty != 'confirmação de dados'
  AND DATE(ap.schedule_date_time) BETWEEN '{start_date}' AND '{end_date}'
  AND ap.cid10_value IS NOT NULL
GROUP BY ap.cid10_value
ORDER BY quantidade DESC
"""

df = pd.read_sql(query2, engine)

if df.empty:
    st.warning("Nenhum dado encontrado para esse intervalo.")
else:
    df_top = df.head(10)

    fig = px.bar(
        df_top,
        x='quantidade',
        y='cid10_value',
        orientation='h',
        text_auto=True,
        labels={'cid10_value': 'CID10', 'quantidade': 'Quantidade'},
        title="Top 10 CID10 por número de atendimentos"
    )

    fig.update_layout(
        yaxis=dict(categoryorder='total ascending'),
        height=500,
        margin=dict(l=100, r=20, t=50, b=20)
    )

    st.plotly_chart(fig, use_container_width=True)


query3 = f"""
SELECT appointment_specialty, COUNT(*) as quantidade
FROM appointments
WHERE appointment_specialty != 'Confirmação de Dados'
  AND DATE(CONVERT_TZ(schedule_date_time, '+00:00', '-03:00')) BETWEEN '{start_date}' AND '{end_date}'
GROUP BY appointment_specialty
ORDER BY quantidade DESC
LIMIT 10
"""
df3 = pd.read_sql(query3, engine)

if df3.empty:
    st.warning("Nenhum dado encontrado para esse intervalo.")
else:
    fig3 = px.bar(
        df3,
        x='quantidade',
        y='appointment_specialty',
        orientation='h',
        text_auto=True,
        labels={'appointment_specialty': 'Especialidade', 'quantidade': 'Quantidade'},
        title="Top 10 Especialidades"
    )

    fig3.update_layout(
        yaxis={'categoryorder': 'total ascending'},
        height=400,
        margin=dict(l=100, r=20, t=50, b=20)
    )

    st.plotly_chart(fig3, use_container_width=True)
