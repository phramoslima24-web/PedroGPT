// =====================
// BASE URL
// =====================
const API = "https://pedrogpt.onrender.com";


// =====================
// FORMATAR RESPOSTA DA IA
// =====================
function formatarResposta(texto) {

    if (!texto) return "";

    // Protege o HTML contra inserção de código
    let html = String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // =====================
    // BLOCOS DE CÓDIGO
    // =====================

    const blocosCodigo = [];

    html = html.replace(
        /```([\s\S]*?)```/g,
        function (_, codigo) {

            const id = blocosCodigo.length;

            blocosCodigo.push(
                `<pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>`
            );

            return `___CODIGO_${id}___`;
        }
    );


    // =====================
    // NEGRITO
    // =====================

    html = html.replace(
        /\*\*(.+?)\*\*/g,
        "<strong>$1</strong>"
    );


    // =====================
    // ITÁLICO
    // =====================

    html = html.replace(
        /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
        "<em>$1</em>"
    );


    // =====================
    // TÍTULOS MARKDOWN
    // =====================

    html = html.replace(
        /^### (.+)$/gm,
        "<h4>$1</h4>"
    );

    html = html.replace(
        /^## (.+)$/gm,
        "<h3>$1</h3>"
    );

    html = html.replace(
        /^# (.+)$/gm,
        "<h2>$1</h2>"
    );


    // =====================
    // LISTAS
    // =====================

    const linhas = html.split("\n");

    let resultado = "";
    let listaAberta = false;
    let listaNumeradaAberta = false;

    linhas.forEach(linha => {

        const linhaTrim = linha.trim();

        // ---------------------
        // TÓPICO
        // ---------------------

        if (/^[-•]\s+/.test(linhaTrim)) {

            if (listaNumeradaAberta) {
                resultado += "</ol>";
                listaNumeradaAberta = false;
            }

            if (!listaAberta) {
                resultado += "<ul>";
                listaAberta = true;
            }

            const item = linhaTrim.replace(/^[-•]\s+/, "");

            resultado += `<li>${item}</li>`;

            return;
        }


        // ---------------------
        // LISTA NUMERADA
        // ---------------------

        if (/^\d+[.)]\s+/.test(linhaTrim)) {

            if (listaAberta) {
                resultado += "</ul>";
                listaAberta = false;
            }

            if (!listaNumeradaAberta) {
                resultado += "<ol>";
                listaNumeradaAberta = true;
            }

            const item = linhaTrim.replace(/^\d+[.)]\s+/, "");

            resultado += `<li>${item}</li>`;

            return;
        }


        // ---------------------
        // FECHA LISTAS
        // ---------------------

        if (listaAberta) {
            resultado += "</ul>";
            listaAberta = false;
        }

        if (listaNumeradaAberta) {
            resultado += "</ol>";
            listaNumeradaAberta = false;
        }


        // ---------------------
        // LINHA VAZIA
        // ---------------------

        if (!linhaTrim) {
            resultado += "<div class='quebra-linha'></div>";
            return;
        }


        // ---------------------
        // TEXTO NORMAL
        // ---------------------

        resultado += `<div class="linha-resposta">${linha}</div>`;
    });


    // =====================
    // FECHA LISTAS
    // =====================

    if (listaAberta) {
        resultado += "</ul>";
    }

    if (listaNumeradaAberta) {
        resultado += "</ol>";
    }


    // =====================
    // RESTAURA CÓDIGOS
    // =====================

    blocosCodigo.forEach((codigo, index) => {

        resultado = resultado.replace(
            `___CODIGO_${index}___`,
            codigo
        );

    });


    // =====================
    // QUEBRAS DE LINHA
    // =====================

    return resultado;
}


// =====================
// HISTÓRICO
// =====================
async function carregarHistorico() {

    try {

        const resposta = await fetch(`${API}/history`);

        if (!resposta.ok) {

            console.warn(
                "Erro ao carregar histórico:",
                resposta.status
            );

            return;
        }

        const historico = await resposta.json();

        const chat = document.getElementById("chat");

        if (!chat) return;

        chat.innerHTML = "";


        historico.forEach(item => {

            // Compatibilidade com formatos antigos
            let sender;
            let message;

            if (Array.isArray(item)) {

                sender = item[0];
                message = item[1];

            } else {

                sender = item?.sender ?? "bot";
                message = item?.message ?? "";

            }

            addMensagem(
                message,
                sender === "user"
                    ? "user"
                    : "bot"
            );

        });

        scrollBottom();


    } catch (erro) {

        console.error(
            "Erro no histórico:",
            erro
        );

    }
}


// =====================
// ENVIAR MENSAGEM
// =====================
async function enviar() {

    const campo = document.getElementById("mensagem");

    if (!campo) return;

    const texto = campo.value.trim();

    if (!texto) return;


    // =====================
    // MENSAGEM DO USUÁRIO
    // =====================

    addMensagem(
        texto,
        "user"
    );

    campo.value = "";


    // =====================
    // TYPING
    // =====================

    const typing = addMensagem(
        "",
        "bot typing"
    );


    try {

        const resposta = await fetch(
            `${API}/chat`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    message: texto
                })
            }
        );


        if (!resposta.ok) {

            console.warn(
                "Erro HTTP:",
                resposta.status
            );

            if (typing) {
                typing.remove();
            }

            addMensagem(
                "Erro ao conectar com o servidor",
                "bot"
            );

            return;
        }


        const data = await resposta.json();


        if (typing) {
            typing.remove();
        }


        // =====================
        // RESPOSTA DA IA
        // =====================

        addMensagem(
            data.reply || "Não recebi uma resposta da IA.",
            "bot"
        );


        // =====================
        // VOZ
        // =====================

        const opcaoVoz =
            document.getElementById("voz");


        if (
            opcaoVoz &&
            opcaoVoz.checked
        ) {

            speechSynthesis.cancel();


            const voz =
                new SpeechSynthesisUtterance(
                    data.reply
                );


            voz.lang = "pt-BR";


            speechSynthesis.speak(
                voz
            );

        }


    } catch (erro) {

        console.error(
            "Erro no chat:",
            erro
        );


        if (typing) {
            typing.remove();
        }


        addMensagem(
            "Erro ao conectar com o servidor",
            "bot"
        );

    }
}


// =====================
// MENSAGEM
// =====================
function addMensagem(texto, tipo) {

    const div =
        document.createElement("div");


    div.classList.add(
        tipo === "user"
            ? "msg-user"
            : "msg-bot"
    );


    // =====================
    // TYPING
    // =====================

    if (tipo.includes("typing")) {

        div.innerHTML = `
            <div>
                🤖 PedroGPT está digitando...

                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;


        const chat =
            document.getElementById("chat");


        if (chat) {

            chat.appendChild(div);


            requestAnimationFrame(() => {

                chat.scrollTop =
                    chat.scrollHeight;

            });

        }


        return div;
    }


    // =====================
    // HORA
    // =====================

    const now =
        new Date();


    const hora =
        now.getHours()
            .toString()
            .padStart(2, "0")
        + ":" +
        now.getMinutes()
            .toString()
            .padStart(2, "0");


    // =====================
    // TEXTO DO USUÁRIO
    // =====================

    let conteudo;


    if (tipo === "user") {

        // Usuário não precisa interpretar Markdown
        conteudo =
            String(texto || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;")
                .replace(/\n/g, "<br>");

    }

    // =====================
    // RESPOSTA DO BOT
    // =====================

    else {

        conteudo =
            formatarResposta(texto);

    }


    // =====================
    // MENSAGEM FINAL
    // =====================

    div.innerHTML = `
        <div class="conteudo-mensagem">
            ${conteudo}
        </div>

        <div style="
            font-size:10px;
            opacity:0.5;
            margin-top:5px;
            text-align:right;
        ">
            ${hora}
        </div>
    `;


    const chat =
        document.getElementById("chat");


    if (chat) {

        chat.appendChild(div);


        requestAnimationFrame(() => {

            chat.scrollTop =
                chat.scrollHeight;

        });

    }


    return div;
}


// =====================
// NOVA CONVERSA
// =====================
async function novaConversa() {

    if (
        !confirm(
            "Deseja apagar todo o histórico desta conversa?"
        )
    ) {
        return;
    }


    try {

        const resposta =
            await fetch(
                `${API}/new_chat`,
                {
                    method: "POST"
                }
            );


        const data =
            await resposta.json();


        if (data.success) {

            const chat =
                document.getElementById("chat");


            if (chat) {
                chat.innerHTML = "";
            }


            speechSynthesis.cancel();


        } else {

            alert(
                "Erro ao criar nova conversa."
            );

        }


    } catch (erro) {

        console.error(erro);


        alert(
            "Erro ao conectar com o servidor."
        );

    }
}


// =====================
// SCROLL
// =====================
function scrollBottom() {

    const chat =
        document.getElementById("chat");


    if (chat) {

        chat.scrollTop =
            chat.scrollHeight;

    }
}


// =====================
// INIT
// =====================
document.addEventListener(
    "DOMContentLoaded",
    () => {

        carregarHistorico();


        // =====================
        // ENTER
        // =====================

        const campo =
            document.getElementById("mensagem");


        if (campo) {

            campo.addEventListener(
                "keydown",
                function (event) {

                    if (
                        event.key === "Enter" &&
                        !event.shiftKey
                    ) {

                        event.preventDefault();

                        enviar();

                    }

                }
            );

        }


        // =====================
        // VOZ
        // =====================

        const opcaoVoz =
            document.getElementById("voz");


        if (opcaoVoz) {

            opcaoVoz.addEventListener(
                "change",
                () => {

                    if (!opcaoVoz.checked) {

                        speechSynthesis.cancel();

                    }

                }
            );

        }

    }
);
