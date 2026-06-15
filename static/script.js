async function enviar() {
    const campo = document.getElementById("mensagem");
    const chat = document.getElementById("chat");

    const texto = campo.value.trim();

    if (!texto) return;

    chat.innerHTML += `<div><b>Você:</b> ${texto}</div>`;

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

        chat.innerHTML += `<div><b>Bot:</b> ${data.reply}</div>`;

    } catch (erro) {
        console.error(erro);

        chat.innerHTML += `
            <div style="color:red">
                <b>Erro ao conectar com o servidor</b>
            </div>
        `;
    }

    chat.scrollTop = chat.scrollHeight;
}