const mqtt_server = "broker.hivemq.com";
const mqtt_port = 8884;
const mqtt_user = "";
const mqtt_password = "";
const topic = "scooby/rayshield/ldr";

let ultimaIntrusaoTimestamp = null;
let intervaloCronometro = null;
let emViolacao = false;

let timestampsPontos = Array(15).fill(null);
let idUnicoPontos = Array(15).fill(null);
let contadorIds = 0;
let idPontoFixado = null;

const client = mqtt.connect(`wss://${mqtt_server}:${mqtt_port}/mqtt`, {
    username: mqtt_user,
    password: mqtt_password
});

const statusBadge = document.getElementById("status");
const mensagemDisplay = document.getElementById("mensagem");
const caixaAlarme = document.getElementById("caixa-alarme");
const textoAlarme = document.getElementById("texto-alarme");
const tempoIntrusaoDisplay = document.getElementById("tempo-intrusao");

const ctx = document.getElementById('graficoLDR').getContext('2d');
const gradient = ctx.createLinearGradient(0, 0, 0, 300);
gradient.addColorStop(0, 'rgba(13, 202, 240, 0.15)');
gradient.addColorStop(1, 'rgba(13, 202, 240, 0.0)');

function formatarTempoDecorrido(dataPassada) {
    if (!dataPassada) return 'Sem dados';

    const agora = new Date();
    const diffMilissegundos = agora - dataPassada;
    const diffSegundos = Math.floor(diffMilissegundos / 1000);

    if (diffSegundos < 1) return 'Agora';
    if (diffSegundos < 60) return `Há ${diffSegundos}s`;

    const diffMinutos = Math.floor(diffSegundos / 60);
    if (diffMinutos < 60) return `Há ${diffMinutos}m`;

    const diffHoras = Math.floor(diffMinutos / 60);
    if (diffHoras < 24) return `Há ${diffHoras}h ${diffMinutos % 60}m`;

    const diffDias = Math.floor(diffHoras / 24);
    return `Há ${diffDias}d ${diffHoras % 24}h`;
}

const grafico = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(15).fill('---'),
        datasets: [{
            label: 'Leitura',
            data: Array(15).fill(null),
            borderColor: '#0dcaf0',
            backgroundColor: gradient,
            borderWidth: 3,
            tension: 0.3,
            pointRadius: function (context) {
                const valor = context.dataset.data[context.dataIndex];
                return (valor !== null && valor < 600) ? 6 : 4;
            },
            pointBackgroundColor: function (context) {
                const valor = context.dataset.data[context.dataIndex];
                return (valor !== null && valor < 600) ? '#ffc107' : '#0dcaf0';
            },
            pointBorderColor: function (context) {
                const valor = context.dataset.data[context.dataIndex];
                return (valor !== null && valor < 600) ? '#dc3545' : '#0dcaf0';
            },
            pointBorderWidth: function (context) {
                const valor = context.dataset.data[context.dataIndex];
                return (valor !== null && valor < 600) ? 2 : 1;
            },
            hitRadius: 25,
            pointHoverRadius: 10,
            pointHoverBorderWidth: 4,
            pointHoverBackgroundColor: '#ffffff',
            fill: true
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 800,
            easing: 'easeOutQuart'
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: true,
                mode: 'nearest',
                intersect: false,
                backgroundColor: '#0f172a',
                titleColor: '#9ca3af',
                titleFont: { size: 11, family: 'monospace' },
                bodyFont: { size: 13, family: 'monospace' },
                borderColor: '#334155',
                borderWidth: 3,
                cornerRadius: 8,
                padding: 14,
                displayColors: false,
                callbacks: {
                    title: function (context) {
                        return `>> REPORT_TIME: ${context[0].label}`;
                    },
                    label: function (context) {
                        const index = context.dataIndex;
                        const valor = context.parsed.y;
                        const tPonto = timestampsPontos[index];

                        if (valor === null || !tPonto) return ' > NO_DATA_DETECTED';

                        const ehInvasao = valor < 600;
                        const tempoTexto = formatarTempoDecorrido(tPonto);
                        const horarioExato = tPonto.toTimeString().split(' ')[0];

                        return [
                            ` > FLUXO_LDR: ${valor}`,
                            ` > STATUS: ${ehInvasao ? '⚠️ INVASÃO' : '🔒 SEGURO'}`,
                            ` > REGISTRO: ${horarioExato} (${tempoTexto.toUpperCase()})`
                        ];
                    },
                    labelTextColor: function (context) {
                        const valor = context.parsed.y;
                        if (context.label && context.label.includes(' > STATUS:')) {
                            return valor < 600 ? '#ef4444' : '#22c55e';
                        }
                        return valor < 600 ? '#f59e0b' : '#38bdf8';
                    }
                }
            }
        },
        onClick: (event, elements) => {
            if (elements.length > 0) {
                const index = elements[0].index;
                idPontoFixado = idUnicoPontos[index];
                grafico.tooltip.setActiveElements([{ datasetIndex: 0, index: index }], { x: elements[0].element.x, y: elements[0].element.y });
            } else {
                idPontoFixado = null;
                grafico.tooltip.setActiveElements([], { x: 0, y: 0 });
            }
            grafico.update('none');
        },
        onHover: (event, elements) => {
            if (idPontoFixado !== null) {
                const indexAtual = idUnicoPontos.indexOf(idPontoFixado);
                if (indexAtual !== -1) {
                    const meta = grafico.getDatasetMeta(0);
                    const model = meta.data[indexAtual];
                    if (model) {
                        grafico.tooltip.setActiveElements([{ datasetIndex: 0, index: indexAtual }], { x: model.x, y: model.y });
                        return false;
                    }
                }
            }
        },
        interaction: {
            mode: 'nearest',
            intersect: false
        },
        scales: {
            x: {
                grid: { color: 'rgba(51, 65, 85, 0.15)' },
                ticks: { color: '#6b7280', font: { size: 10, family: 'monospace' } }
            },
            y: {
                min: 0,
                max: 1024,
                grid: { color: 'rgba(51, 65, 85, 0.2)' },
                ticks: { color: '#6b7280', font: { family: 'monospace' } }
            }
        }
    }
});

function obterHorarioAtual() {
    const agora = new Date();
    return agora.toTimeString().split(' ')[0];
}

function atualizarGrafico(novoValor, corHex, corGradienteTopo) {
    const dataset = grafico.data.datasets[0];
    const horario = obterHorarioAtual();

    grafico.data.labels.push(horario);
    grafico.data.labels.shift();

    dataset.data.push(novoValor);
    dataset.data.shift();

    timestampsPontos.push(new Date());
    timestampsPontos.shift();

    contadorIds++;
    idUnicoPontos.push(contadorIds);
    idUnicoPontos.shift();

    dataset.borderColor = corHex;
    const newGradient = ctx.createLinearGradient(0, 0, 0, 300);
    newGradient.addColorStop(0, corGradienteTopo);
    newGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    dataset.backgroundColor = newGradient;

    if (idPontoFixado !== null) {
        const indexAtual = idUnicoPontos.indexOf(idPontoFixado);
        if (indexAtual !== -1) {
            grafico.update('none');
            const meta = grafico.getDatasetMeta(0);
            const model = meta.data[indexAtual];
            if (model) {
                grafico.tooltip.setActiveElements([{ datasetIndex: 0, index: indexAtual }], { x: model.x, y: model.y });
            }
        } else {
            idPontoFixado = null;
            grafico.update();
        }
    } else {
        grafico.update();
    }
}

function gerenciarCronometro() {
    if (intervaloCronometro) clearInterval(intervaloCronometro);

    intervaloCronometro = setInterval(() => {
        if (emViolacao) {
            tempoIntrusaoDisplay.innerText = "AGORA";
            tempoIntrusaoDisplay.className = "py-2 bg-dark text-danger fs-3 fw-bold rounded-3 text-center border border-secondary display-numeric status-agora";
            return;
        }

        if (!ultimaIntrusaoTimestamp) return;

        tempoIntrusaoDisplay.classList.remove("status-agora");
        const tempoTexto = formatarTempoDecorrido(ultimaIntrusaoTimestamp);
        const horarioExato = ultimaIntrusaoTimestamp.toTimeString().split(' ')[0];
        tempoIntrusaoDisplay.innerText = `${horarioExato} (${tempoTexto.toUpperCase()})`;
    }, 1000);
}

client.on("connect", () => {
    statusBadge.innerText = "ONLINE";
    statusBadge.className = "badge bg-success badge-telemetria p-2";

    client.subscribe(topic, (erro) => {
        if (!erro) {
            console.log("Subscribed:", topic);
        }
    });
});

client.on("message", (topic, message) => {
    const texto = message.toString();
    mensagemDisplay.innerText = texto;

    const valorLDR = parseInt(texto);

    if (valorLDR < 600) {
        emViolacao = true;
        textoAlarme.innerText = "⚠️ VIOLAÇÃO DE PERÍMETRO";
        caixaAlarme.className = "status-box alert alert-danger d-flex align-items-center justify-content-center border-0 rounded-3 mb-0 fw-bold text-uppercase shadow-sm text-center";

        tempoIntrusaoDisplay.innerText = "AGORA";
        tempoIntrusaoDisplay.className = "py-2 bg-dark text-danger fs-3 fw-bold rounded-3 text-center border border-secondary display-numeric status-agora";

        gerenciarCronometro();
        atualizarGrafico(valorLDR, '#dc3545', 'rgba(220, 53, 69, 0.25)');
    } else {
        if (emViolacao) {
            emViolacao = false;
            ultimaIntrusaoTimestamp = new Date();
        }

        textoAlarme.innerText = "🔒 PERÍMETRO SEGURO";
        caixaAlarme.className = "status-box alert alert-success d-flex align-items-center justify-content-center border-0 rounded-3 mb-0 fw-bold text-uppercase shadow-sm text-center";

        if (!ultimaIntrusaoTimestamp) {
            tempoIntrusaoDisplay.innerText = "Sem Ocorrências";
            tempoIntrusaoDisplay.className = "py-2 bg-dark text-warning fs-3 fw-bold rounded-3 text-center border border-secondary display-numeric";
        } else {
            tempoIntrusaoDisplay.className = "py-2 bg-dark text-warning fs-3 fw-bold rounded-3 text-center border border-secondary display-numeric";
            const tempoTexto = formatarTempoDecorrido(ultimaIntrusaoTimestamp);
            const horarioExato = ultimaIntrusaoTimestamp.toTimeString().split(' ')[0];
            tempoIntrusaoDisplay.innerText = `${horarioExato} (${tempoTexto.toUpperCase()})`;
        }

        atualizarGrafico(valorLDR, '#198754', 'rgba(25, 135, 84, 0.20)');
    }
});
