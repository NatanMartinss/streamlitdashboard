# sidebar.py
import streamlit as st
from datetime import datetime, timedelta


def mostrar_pagina(nome: str):
    with st.sidebar.expander("📄 Páginas", expanded=True):
        st.markdown(f"Você está na página: **{nome}**")

def seletor_de_datas(chave_pagina: str = ""):
    with st.sidebar.expander("📅 Filtro por Data", expanded=True):
        date_option = st.selectbox(
            "Intervalo de datas",
            ["Escolher Data", "Ontem", "Últimos 7 dias", "Último mês", "Últimos 2 meses", "Último trimestre", "Último semestre"],
            key=f"selectbox_{chave_pagina}"
        )

        if date_option == "Escolher Data":
            start_date = st.date_input("Data inicial", datetime.today().date(), key=f"start_{chave_pagina}")
            end_date = st.date_input("Data final", datetime.today().date(), key=f"end_{chave_pagina}")
        elif date_option == "Ontem":
            start_date = end_date = datetime.today().date() - timedelta(days=1)
        elif date_option == "Últimos 7 dias":
            start_date = datetime.today().date() - timedelta(days=7)
            end_date = datetime.today().date()
        elif date_option == "Último mês":
            start_date = datetime.today().date() - timedelta(days=30)
            end_date = datetime.today().date()
        elif date_option == "Últimos 2 meses":
            start_date = datetime.today().date() - timedelta(days=60)
            end_date = datetime.today().date()
        elif date_option == "Último trimestre":
            start_date = datetime.today().date() - timedelta(days=90)
            end_date = datetime.today().date()
        elif date_option == "Último semestre":
            start_date = datetime.today().date() - timedelta(days=180)
            end_date = datetime.today().date()

        return start_date, end_date
