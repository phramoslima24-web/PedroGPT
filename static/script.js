````javascript
// ============================================================
// Orion AI - SCRIPT.JS
// FASE 4
// ============================================================


// ============================================================
// CONFIGURAÇÃO
// ============================================================

const API = "https://pedrogpt.onrender.com";

let enviando = false;


// ============================================================
// ELEMENTOS
// ============================================================

function elemento(id) {
    return document.getElementById(id);
}


// ============================================================
// ESCAPAR HTML
// ============================================================

function escaparHTML(texto) {

    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// FORMATAR RESPOSTA
// ============================================================

function formatarResposta(texto) {

    if (!texto) return "";

    let protegido = escaparHTML(texto);

    const blocosCodigo = [];

    protegido = protegido.replace(
        /```(?:[a-zA-Z0-9_+-]+)?\s*\n?([\s\S]*?)```/g,
        function (_, codigo) {

            const id = blocosCodigo.length;

            blocosCodigo.push(
                `<pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>`
            );

            return `___CODIGO_${id}___`;
        }
    );

    protegido = protegido.replace(
        /\*\*(.+?)\*\*/g,
        "<strong>$1</strong>"
    );

    protegido = protegido.replace(
        /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
        "<em>$1</em>"
    );

    protegido = protegido.replace(
        /^### (.+)$/gm,
        "<h4>$1</h4>"
    );

    protegido = protegido.replace(
        /^## (.+)$/gm,
        "<h3>$1</h3>"
    );

    protegido = protegido.replace(
        /^# (.+)$/gm,
        "<h2>$1</h2>"
    );

    const linhas = protegido.split("\n");

    let resultado = "";

    let listaAberta = false;

    let listaNumeradaAberta = false;


    linhas.forEach(linha => {

        const trim = linha.trim();


        if (/^[-•*]\s+/.test(trim)) {

            if (listaNumeradaAberta) {

                resultado += "</ol>";

                listaNumeradaAberta = false;
            }


            if (!listaAberta) {

                resultado += "<ul>";

                listaAberta = true;
            }


            const item =
                trim.replace(
                    /^[-•*]\s+/,
                    ""
                );


            resultado += `<li>${item}</li>`;

            return;
        }


        if (/^\d+[.)]\s+/.test(trim)) {

            if (listaAberta) {

                resultado += "</ul>";

                listaAberta = false;
            }


            if (!listaNumeradaAberta) {

                resultado += "<ol>";

                listaNumeradaAberta = true;
            }


            const item =
                trim.replace(
                    /^\d+[.)]\s+/,
                    ""
                );


            resultado += `<li>${item}</li>`;

            return;
        }


        if (listaAberta) {

            resultado += "</ul>";

            listaAberta = false;
        }


        if (listaNumeradaAberta) {

            resultado += "</ol>";

            listaNumeradaAberta = false;
        }


        if (!trim) {

            resultado +=
                `<div class="quebra-linha"></div>`;

            return;
        }


        resultado +=
            `<div class="linha-resposta">${linha}</div>`;

    });


    if (listaAberta) {

        resultado += "</ul>";
    }


    if (listaNumeradaAberta) {

        resultado += "</ol>";
    }


    blocosCodigo.forEach(
        (codigo, index) => {

            resultado =
                resultado.replace(
                    `___CODIGO_${index}___`,
                    codigo
                );

        }
    );


    return resultado;
}


// ============================================================
// ESCONDER WELCOME
// ============================================================

function esconderWelcome() {

    const welcome =
        elemento("welcome");

    if (welcome) {

        welcome.classList.add(
            "hidden"
        );
    }
}


// ============================================================
// MOSTRAR WELCOME
// ============================================================

function mostrarWelcome() {

    const welcome =
        elemento("welcome");

    if (welcome) {

        welcome.classList.remove(
            "hidden"
        );
    }
}


// ============================================================
// SCROLL
// ============================================================

function scrollBottom() {

    const chat =
        elemento("chat");

    if (!chat) return;

    requestAnimationFrame(() => {

        chat.scrollTop =
            chat.scrollHeight;

    });
}


// ============================================================
// MENSAGEM
// ============================================================

function addMensagem(
    texto,
    tipo
) {

    const chat =
        elemento("chat");

    if (!chat) return null;


    const div =
        document.createElement("div");


    const ehUsuario =
        tipo === "user";


    const ehTyping =
        tipo.includes("typing");


    div.classList.add(
        ehUsuario
            ? "msg-user"
            : "msg-bot"
    );


    // ========================================================
    // TYPING
    // ========================================================

    if (ehTyping) {

        div.classList.add(
            "typing-message"
        );


        div.innerHTML = `
            <div class="conteudo-mensagem">
                <span>🤖 Orion AI está digitando</span>

                <span class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </span>
            </div>
        `;


        chat.appendChild(div);

        scrollBottom();

        return div;
    }


    // ========================================================
    // HORA
    // ========================================================

    const agora =
        new Date();


    const hora =
        agora
            .getHours()
            .toString()
            .padStart(2, "0")
        +
        ":" +
        agora
            .getMinutes()
            .toString()
            .padStart(2, "0");


    // ========================================================
    // CONTEÚDO
    // ========================================================

    let conteudo;


    if (ehUsuario) {

        conteudo =
            escaparHTML(texto)
                .replace(
                    /\n/g,
                    "<br>"
                );

    } else {

        conteudo =
            formatarResposta(texto);

    }


    // ========================================================
    // HTML
    // ========================================================

    div.innerHTML = `

        <div class="conteudo-mensagem">
            ${conteudo}
        </div>

        <div
            class="hora-mensagem"
            style="
                font-size:10px;
                opacity:0.5;
                margin-top:5px;
                text-align:right;
            "
        >
            ${hora}
        </div>

    `;


    chat.appendChild(div);

    scrollBottom();


    return div;
}


// ============================================================
// CARREGAR HISTÓRICO
// ============================================================

async function carregarHistorico() {

    try {

        const resposta =
            await fetch(
                `${API}/history`,
                {
                    method: "GET",
                    credentials: "include"
                }
            );


        if (!resposta.ok) {

            console.warn(
                "Erro ao carregar histórico:",
                resposta.status
            );

            return;
        }


        const historico =
            await resposta.json();


        const chat =
            elemento("chat");


        if (!chat) return;


        chat.innerHTML = "";


        if (
            !historico ||
            historico.length === 0
        ) {

            mostrarWelcome();

            return;
        }


        esconderWelcome();


        historico.forEach(
            item => {

                let sender;
                let message;


                if (
                    Array.isArray(item)
                ) {

                    sender =
                        item[0];

                    message =
                        item[1];

                } else {

                    sender =
                        item?.sender ??
                        "bot";

                    message =
                        item?.message ??
                        "";

                }


                addMensagem(
                    message,
                    sender === "user"
                        ? "user"
                        : "bot"
                );

            }
        );


        scrollBottom();


    } catch (erro) {

        console.error(
            "Erro no histórico:",
            erro
        );

    }
}


// ============================================================
// ENVIAR
// ============================================================

async function enviar() {

    if (enviando) return;


    const campo =
        elemento("mensagem");


    if (!campo) return;


    const texto =
        campo.value.trim();


    if (!texto) return;


    enviando = true;


    esconderWelcome();


    addMensagem(
        texto,
        "user"
    );


    campo.value = "";

    campo.focus();


    const typing =
        addMensagem(
            "",
            "bot typing"
        );


    try {

        const resposta =
            await fetch(
                `${API}/chat`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials:
                        "include",

                    body:
                        JSON.stringify({
                            message: texto
                        })
                }
            );


        if (!resposta.ok) {

            if (typing) {
                typing.remove();
            }


            let mensagemErro =
                "Erro ao conectar com o servidor.";


            try {

                const erro =
                    await resposta.json();


                if (erro.reply) {

                    mensagemErro =
                        erro.reply;

                }

                else if (erro.message) {

                    mensagemErro =
                        erro.message;

                }

            } catch (_) {}


            addMensagem(
                mensagemErro,
                "bot"
            );


            enviando = false;

            return;
        }


        const data =
            await resposta.json();


        if (typing) {
            typing.remove();
        }


        const textoResposta =
            data.reply ||
            "Não recebi uma resposta da IA.";


        addMensagem(
            textoResposta,
            "bot"
        );


        falarResposta(
            textoResposta
        );


    } catch (erro) {

        console.error(
            "Erro no chat:",
            erro
        );


        if (typing) {
            typing.remove();
        }


        addMensagem(
            "Erro ao conectar com o servidor.",
            "bot"
        );

    }


    enviando = false;

    campo.focus();
}


// ============================================================
// VOZ
// ============================================================

function falarResposta(texto) {

    const opcaoVoz =
        elemento("voz");


    if (
        !opcaoVoz ||
        !opcaoVoz.checked
    ) {

        return;
    }


    if (
        !("speechSynthesis" in window)
    ) {

        return;
    }


    speechSynthesis.cancel();


    const voz =
        new SpeechSynthesisUtterance(
            texto
        );


    voz.lang =
        "pt-BR";


    voz.rate =
        1;


    voz.pitch =
        1;


    speechSynthesis.speak(
        voz
    );
}


// ============================================================
// ATALHO
// ============================================================

function atalho(texto) {

    esconderWelcome();


    const campo =
        elemento("mensagem");


    if (!campo) return;


    campo.value =
        texto;


    campo.focus();

}


// ============================================================
// NOVA CONVERSA
// ============================================================

async function novaConversa() {

    if (enviando) {

        alert(
            "Aguarde a resposta atual terminar."
        );

        return;
    }


    const confirmar =
        confirm(
            "Criar uma nova conversa?"
        );


    if (!confirmar) return;


    try {

        const resposta =
            await fetch(
                `${API}/new_chat`,
                {
                    method: "POST",

                    credentials:
                        "include"
                }
            );


        const data =
            await resposta.json();


        if (!data.success) {

            alert(
                data.message ||
                "Erro ao criar nova conversa."
            );

            return;
        }


        const chat =
            elemento("chat");


        if (chat) {

            chat.innerHTML = "";

        }


        mostrarWelcome();


        if (
            "speechSynthesis" in window
        ) {

            speechSynthesis.cancel();

        }


        carregarHistorico();


    } catch (erro) {

        console.error(
            "Erro ao criar conversa:",
            erro
        );


        alert(
            "Erro ao conectar com o servidor."
        );

    }
}


// ============================================================
// ENTER
// ============================================================

function configurarEnter() {

    const campo =
        elemento("mensagem");


    if (!campo) return;


    campo.addEventListener(
        "keydown",
        function(event) {

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


// ============================================================
// CONTROLE DA VOZ
// ============================================================

function configurarVoz() {

    const opcaoVoz =
        elemento("voz");


    if (!opcaoVoz) return;


    opcaoVoz.addEventListener(
        "change",
        function() {

            if (
                !opcaoVoz.checked &&
                "speechSynthesis" in window
            ) {

                speechSynthesis.cancel();

            }

        }
    );
}


// ============================================================
// BOTÃO ENTER / LOADING
// ============================================================

function configurarFormulario() {

    const campo =
        elemento("mensagem");


    if (!campo) return;


    campo.addEventListener(
        "input",
        function() {

            campo.style.height =
                "auto";

        }
    );
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function() {

        carregarHistorico();

        configurarEnter();

        configurarVoz();

        configurarFormulario();

    }
);
````
