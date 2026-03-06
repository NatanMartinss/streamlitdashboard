// Tratamento global de erros
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', err => {
    console.error('Uncaught Exception thrown:', err);
});

const axios = require('axios');
const fs = require('fs');
const path = require('path');

function formatDate(date) {
    return date.toISOString().split('.')[0] + 'Z';
}

// 🔑 Lista de empresas (coloque quantas quiser)
const empresas = [
    { nome: "Dez", apiKey: "iAMJ6JeUpE8OTPDcmt2YO17FmgqOXzDt7WpKohCz" },
    { nome: "EccoSalva", apiKey: "Kk1kpn4PfH55PgC2X2kDa61iUFRLHeTO2MF09D1G" },
    { nome: "Verte", apiKey: "qucGDNjy983y7vZFq94hy6Y3Nf9cBYPG9WeZNKrg" },
];

async function fetchDataAndGenerateJSON() {
    const startDate = new Date('2024-06-01T03:00:00.000Z'); // 00:00 UTC-3
    const endDate = new Date('2025-10-31T02:59:59.999Z');   // 23:59 UTC-3
    const daysPerRequest = 35;

    const allAppointments = [];

    for (const empresa of empresas) {
        console.log(`🏢 Iniciando coleta para: ${empresa.nome}`);

        let currentStart = new Date(startDate);

        while (currentStart <= endDate) {
            let currentFinish = new Date(currentStart);
            currentFinish.setDate(currentFinish.getDate() + daysPerRequest - 1);
            if (currentFinish > endDate) currentFinish = new Date(endDate);

            console.log(
                `📡 [${empresa.nome}] Buscando de ${formatDate(currentStart)} até ${formatDate(currentFinish)}`
            );

            try {
                const response = await axios.get(
                    'https://api.doutoraovivo.com.br/report/appointment',
                    {
                        params: {
                            schedule_start_range_start:  formatDate(currentStart),
                            schedule_start_range_finish: formatDate(currentFinish),
                            schedule_status: 'REA',
                            status: true
                        },
                        headers: {
                            'x-api-key': empresa.apiKey,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // Insere os dados já enriquecidos com empresa + apiKey
                const enrichedData = response.data.map(item => ({
                    ...item,
                    empresa: empresa.nome,
                    apiKey: empresa.apiKey
                }));

                allAppointments.push(...enrichedData);

            } catch (error) {
                console.error(
                    `❌ [${empresa.nome}] Erro ao buscar de ${formatDate(currentStart)} a ${formatDate(currentFinish)}`,
                    error.response?.data || error.message
                );
            }

            currentStart.setDate(currentStart.getDate() + daysPerRequest);
        }
    }

    // Gravar JSON final unificado
    const outputPath = path.resolve(__dirname, 'consultastotais.json');
    fs.writeFileSync(outputPath, JSON.stringify(allAppointments, null, 2), 'utf-8');
    console.log(`✅ Arquivo JSON gerado em: ${outputPath} (${allAppointments.length} registros)`);
}

fetchDataAndGenerateJSON().catch(err => console.error('Erro CRÍTICO:', err.message));
