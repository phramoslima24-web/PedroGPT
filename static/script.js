async function enviar() {
    const input = document.getElementById("mensagem").value;
    const chat = document.getElementById("chat");

    if (!input) return;

    chat.innerHTML += `<div><b>Você:</b> ${input}</div>`;

    try {
        const resposta = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: input })
        });

        const data = await resposta.json();

        chat.innerHTML += `<div><b>Bot:</b> ${data.reply}</div>`;

    } catch (error) {
        console.error(error);
        chat.innerHTML += `<div style="color:red"><b>Erro ao conectar com o servidor</b></div>`;
    }

    document.getElementById("mensagem").value = "";
}