const mqtt_server = "broker.hivemq.com";
const mqtt_port = 8884;
const mqtt_user = "";
const mqtt_password = "";
const topic = "scooby/rayshield/ldr";

const client = mqtt.connect(`wss://${mqtt_server}:${mqtt_port}/mqtt`, {
    username: mqtt_user,
    password: mqtt_password
});

const statusBadge = document.getElementById("status");
const mensagemDisplay = document.getElementById("mensagem");
const caixaAlarme = document.getElementById("caixa-alarme");
const textoAlarme = document.getElementById("texto-alarme");

client.on("connect", () => {
    console.log("Conectado ao broker MQTT");
    statusBadge.innerText = "Conectado";
    statusBadge.className = "badge bg-success";

    client.subscribe(topic, (erro) => {
        if (erro) {
            console.log("Erro ao inscrever no tópico", erro);
        } else {
            console.log("Inscrito no tópico:", topic);
        }
    });
});

client.on("message", (topic, message) => {
    const texto = message.toString();
    console.log("Mensagem recebida:", texto);

    mensagemDisplay.innerText = texto;
    const valorLDR = parseInt(texto);

    if (valorLDR < 690) {
        textoAlarme.innerText = "INTRUSÃO!";
        caixaAlarme.className = "status-box alert alert-danger d-flex align-items-center justify-content-center border-0 rounded-3 my-4 shadow-sm";
    } else {
        textoAlarme.innerText = "Feixe Alinhado";
        caixaAlarme.className = "status-box alert alert-success d-flex align-items-center justify-content-center border-0 rounded-3 my-4 shadow-sm";
    }
});