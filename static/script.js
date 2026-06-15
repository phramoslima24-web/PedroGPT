async function carregarHistorico() {

    try {

        const resposta = await fetch("/history");
        const historico = await resposta.json();

        const chat = document.getElementById("chat");
        chat.innerHTML = "";

        historico.forEach(item => {

            const sender = item[0];
            const message = item[1];

            if (sender === "user") {

                chat.innerHTML += `
                    <div class="msg-user">
                        ${message}
                    </div>
                `;

            } else {

                chat.innerHTML += `
                    <div class="msg-bot">
                        ${message}
                    </div>
                `;

            }

        });

        chat.scrollTop = chat.scrollHeight;

    } catch (erro) {
        console.error(erro);
    }
}

async function enviar() {

    const campo = document.getElementById("mensagem");
    const chat = document.getElementById("chat");

    const texto = campo.value.trim();

    if (!texto) return;

    // mostra mensagem do usuário
    chat.innerHTML += `
        <div class="msg-user">
            ${texto}
        </div>
    `;

    chat.scrollTop = chat.scrollHeight;

    campo.value = "";

    try {

        const resposta = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: texto
            })
        });

        const data = await resposta.json();

        chat.innerHTML += `
            <div class="msg-bot">
                ${data.reply}
            </div>
        `;

        chat.scrollTop = chat.scrollHeight;

        // 🔊 VOZ
        const opcaoVoz = document.getElementById("voz");

        if (opcaoVoz && opcaoVoz.checked) {

            speechSynthesis.cancel();

            const voz = new SpeechSynthesisUtterance(data.reply);
            voz.lang = "pt-BR";

            speechSynthesis.speak(voz);
        }

    } catch (erro) {

        console.error(erro);

        chat.innerHTML += `
            <div class="msg-bot">
                Erro ao conectar com o servidor.
            </div>
        `;
    }
}

// ENTER + inicialização
document.addEventListener("DOMContentLoaded", () => {

    carregarHistorico();

    const campo = document.getElementById("mensagem");

    if (campo) {
        campo.addEventListener("keypress", function (event) {
            if (event.key === "Enter") {
                enviar();
            }
        });
    }

    const opcaoVoz = document.getElementById("voz");

    if (opcaoVoz) {
        opcaoVoz.addEventListener("change", () => {
            if (!opcaoVoz.checked) {
                speechSynthesis.cancel();
            }
        });
    }
});