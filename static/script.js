````javascript
// ============================================================
// ORION AI - SCRIPT.JS
// ============================================================

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

    if (!texto) {
        return "";
    }

    let protegido = escaparHTML(texto);

    const blocosCodigo = [];

    protegido = protegido.replace(
        /```([a-zA-Z0-9_+#.-]*)\s*\n?([\s\S]*?)```/g,
        function (_, linguagem, codigo) {

            const id = blocosCodigo.length;

            const codigoSeguro = codigo.trim();

            blocosCodigo.push(
                `<pre class="codigo-pedrogpt"><code>${codigoSeguro}</code></pre>`
            );

            return `___CODIGO_${id}___`;
        }
    );

    // Negrito
    protegido = protegido.replace(
        /\*\*(.+?)\*\*/g,
        "<strong>$1</strong>"
    );

    // Itálico
    protegido = protegido.replace(
        /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
        "<em>$1</em>"
    );

    // Títulos
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

    linhas.forEach(function (linha) {

        const trim = linha.trim();

        // Lista com -
        if (/^[-•*]\s+/.test(trim)) {

            if (listaNumeradaAberta) {

                resultado += "</ol>";

                listaNumeradaAberta = false;
            }

            if (!listaAberta) {

                resultado += "<ul>";

                listaAberta = true;
            }

            const item = trim.replace(
                /^[-•*]\s+/,
                ""
            );

            resultado += `<li>${item}</li>`;

            return;
        }

        // Lista numerada
        if (/^\d+[.)]\s+/.test(trim)) {

            if (listaAberta) {

                resultado += "</ul>";

                listaAberta = false;
            }

            if (!listaNumeradaAberta) {

                resultado += "<ol>";

                listaNumeradaAberta = true;
            }

            const item = trim.replace(
                /^\d+[.)]\s+/,
                ""
            );

            resultado += `<li>${item}</li>`;

            return;
        }

        // Fecha listas
        if (listaAberta) {

            resultado += "</ul>";

            listaAberta = false;
        }

        if (listaNumeradaAberta) {

            resultado += "</ol>";

            listaNumeradaAberta = false;
        }

        // Linha vazia
        if (!trim) {

            resultado +=
                `<div class="quebra-linha"></div>`;

            return;
        }

        resultado +=
            `<div class="linha-resposta">${linha}</div>`;
    });

    // Fecha listas restantes
    if (listaAberta) {
        resultado += "</ul>";
    }

    if (listaNumeradaAberta) {
        resultado += "</ol>";
    }

    // Insere blocos de código
    blocosCodigo.forEach(
        function (codigo, index) {

            resultado = resultado.replace(
                `___CODIGO_${index}___`,
                codigo
            );
        }
    );

    return resultado;
}


// ============================================================
// WELCOME
// ============================================================

function esconderWelcome() {

    const welcome = elemento("welcome");

    if (welcome) {
        welcome.classList.add("hidden");
    }
}


function mostrarWelcome() {

    const welcome = elemento("welcome");

    if (welcome) {
        welcome.classList.remove("hidden");
    }
}


// ============================================================
// SCROLL
// ============================================================

function scrollBottom() {

    const chat = elemento("chat");

    if (!chat) {
        return;
    }

    requestAnimationFrame(function () {

        chat.scrollTop =
            chat.scrollHeight;
    });
}


// ============================================================
// ADICIONAR MENSAGEM
// ============================================================

function addMensagem(texto, tipo) {

    const chat = elemento("chat");

    if (!chat) {
        return null;
    }

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
    // DIGITANDO
    // ========================================================

    if (ehTyping) {

        div.classList.add(
            "typing-message"
        );

        div.innerHTML = `
            <div class="conteudo-mensagem">

                <span>
                    🤖 Orion AI está digitando
                </span>

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

    const agora = new Date();

    const hora =
        agora.getHours()
            .toString()
            .padStart(2, "0")
        +
        ":"
        +
        agora.getMinutes()
            .toString()
            .padStart(2, "0");


    // ========================================================
    // CONTEÚDO
    // ========================================================

    let conteudo;

    if (ehUsuario) {

        conteudo =
            escaparHTML(texto)
                .replace(/\n/g, "<br>");

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
                "/history",
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store"
                }
            );


        if (resposta.status === 401) {

            console.warn(
                "Usuário não está autenticado."
            );

            return;
        }


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

        if (!chat) {
            return;
        }


        chat.innerHTML = "";


        if (
            !Array.isArray(historico) ||
            historico.length === 0
        ) {

            mostrarWelcome();

            return;
        }


        esconderWelcome();


        historico.forEach(function (item) {

            const sender =
                item?.sender ?? "bot";

            const message =
                item?.message ?? "";


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


// ============================================================
// ENVIAR MENSAGEM
// ============================================================

async function enviar() {

    if (enviando) {
        return;
    }


    const campo =
        elemento("mensagem");

    const botao =
        elemento("btnEnviar");


    if (!campo) {
        return;
    }


    const texto =
        campo.value.trim();


    if (!texto) {

        campo.focus();

        return;
    }


    enviando = true;


    esconderWelcome();


    // Mensagem do usuário
    addMensagem(
        texto,
        "user"
    );


    campo.value = "";


    if (botao) {

        botao.disabled = true;

        botao.textContent =
            "Enviando...";
    }


    // Digitando
    const typing =
        addMensagem(
            "",
            "bot typing"
        );


    try {

        const resposta =
            await fetch(
                "/chat",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"
                    },

                    credentials:
                        "same-origin",

                    body:
                        JSON.stringify({
                            message: texto
                        })
                }
            );


        if (typing) {
            typing.remove();
        }


        let data = {};


        try {

            data =
                await resposta.json();

        } catch (erroJSON) {

            console.error(
                "Resposta não é JSON:",
                erroJSON
            );
        }


        // ====================================================
        // ERRO
        // ====================================================

        if (!resposta.ok) {

            let mensagemErro =
                "Erro ao conectar com o servidor.";


            if (data.reply) {

                mensagemErro =
                    data.reply;

            } else if (data.message) {

                mensagemErro =
                    data.message;
            }


            addMensagem(
                mensagemErro,
                "bot"
            );

            return;
        }


        // ====================================================
        // RESPOSTA DA IA
        // ====================================================

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
            "❌ Erro ao conectar com o servidor. Verifique os logs do servidor.",
            "bot"
        );

    } finally {

        enviando = false;


        if (botao) {

            botao.disabled = false;

            botao.textContent =
                "Enviar";
        }


        campo.focus();
    }
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

    const campo =
        elemento("mensagem");


    if (!campo) {
        return;
    }


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


    try {

        const resposta =
            await fetch(
                "/new_chat",
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        let data = {};


        try {

            data =
                await resposta.json();

        } catch (erroJSON) {

            console.error(
                "Erro ao interpretar nova conversa:",
                erroJSON
            );
        }


        if (
            !resposta.ok ||
            !data.success
        ) {

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


        const titulo =
            elemento("tituloConversa");


        if (titulo) {

            titulo.textContent =
                "Orion AI";
        }


        await carregarHistorico();

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


    if (!campo) {
        return;
    }


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


// ============================================================
// VOZ
// ============================================================

function configurarVoz() {

    const opcaoVoz =
        elemento("voz");


    if (!opcaoVoz) {
        return;
    }


    opcaoVoz.addEventListener(
        "change",
        function () {

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
// FORMULÁRIO
// ============================================================

function configurarFormulario() {

    const campo =
        elemento("mensagem");


    if (!campo) {
        return;
    }


    campo.addEventListener(
        "input",
        function () {

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
    async function () {

        console.log(
            "Orion AI: script carregado."
        );


        await carregarHistorico();


        configurarEnter();


        configurarVoz();


        configurarFormulario();
    }
);
````

### Git

```bash
git add .
git commit -m "Remove sistema de conversas da interface"
git push
```
