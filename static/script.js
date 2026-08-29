````javascript
// ============================================================
// ORION AI - SCRIPT.JS
// ============================================================

let enviando = false;
let arquivoSelecionado = null;


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
// ELEMENTOS DO CHAT
// ============================================================

const chat = elemento("chat");
const welcome = elemento("welcome");
const mensagemInput = elemento("mensagem");
const btnEnviar = elemento("btnEnviar");
const btnArquivo = elemento("btnArquivo");
const arquivoInput = elemento("arquivo");
const arquivoBox = elemento("arquivoSelecionado");
const nomeArquivo = elemento("nomeArquivo");
const removerArquivo = elemento("removerArquivo");


// ============================================================
// MOSTRAR / ESCONDER WELCOME
// ============================================================

function atualizarWelcome() {

    if (!chat || !welcome) {
        return;
    }

    const quantidade = chat.children.length;

    if (quantidade === 0) {
        welcome.classList.remove("hidden");
    } else {
        welcome.classList.add("hidden");
    }
}


// ============================================================
// ADICIONAR MENSAGEM
// ============================================================

function adicionarMensagem(texto, tipo) {

    if (!chat) {
        return null;
    }

    const div = document.createElement("div");

    div.className =
        tipo === "user"
            ? "msg-user"
            : "msg-bot";

    const conteudo = document.createElement("div");

    conteudo.className = "conteudo-mensagem";

    conteudo.textContent = texto;

    div.appendChild(conteudo);

    chat.appendChild(div);

    atualizarWelcome();

    chat.scrollTop = chat.scrollHeight;

    return div;
}


// ============================================================
// TYPING
// ============================================================

function mostrarTyping() {

    if (!chat) {
        return null;
    }

    const div = document.createElement("div");

    div.className = "msg-bot typing-message";

    div.id = "typingMessage";

    div.innerHTML = `
        <div class="conteudo-mensagem">
            Orion AI está digitando
            <span class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </span>
        </div>
    `;

    chat.appendChild(div);

    atualizarWelcome();

    chat.scrollTop = chat.scrollHeight;

    return div;
}


function removerTyping() {

    const typing = elemento("typingMessage");

    if (typing) {
        typing.remove();
    }
}


// ============================================================
// MARKDOWN SIMPLES
// ============================================================

function formatarResposta(texto) {

    let html = escaparHTML(texto);

    // Blocos de código
    html = html.replace(
        /```([\s\S]*?)```/g,
        function(_, codigo) {

            return `
                <pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>
            `;
        }
    );

    // Títulos
    html = html.replace(
        /^### (.*)$/gm,
        "<h4>$1</h4>"
    );

    html = html.replace(
        /^## (.*)$/gm,
        "<h3>$1</h3>"
    );

    html = html.replace(
        /^# (.*)$/gm,
        "<h2>$1</h2>"
    );

    // Negrito
    html = html.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    // Itálico
    html = html.replace(
        /\*(.*?)\*/g,
        "<em>$1</em>"
    );

    // Quebras de linha
    html = html.replace(
        /\n/g,
        "<br>"
    );

    return html;
}


// ============================================================
// ADICIONAR RESPOSTA DA IA
// ============================================================

function adicionarResposta(texto) {

    if (!chat) {
        return null;
    }

    const div = document.createElement("div");

    div.className = "msg-bot";

    const conteudo = document.createElement("div");

    conteudo.className = "conteudo-mensagem";

    conteudo.innerHTML = formatarResposta(texto);

    div.appendChild(conteudo);

    chat.appendChild(div);

    atualizarWelcome();

    chat.scrollTop = chat.scrollHeight;

    falarResposta(texto);

    return div;
}


// ============================================================
// NOVA CONVERSA
// ============================================================

async function novaConversa() {

    // Não deixa criar várias conversas ao mesmo tempo
    if (enviando) {
        return;
    }

    const botao = document.querySelector(".nova-conversa");

    const textoOriginal =
        botao
            ? botao.textContent
            : "";

    try {

        enviando = true;

        if (botao) {
            botao.disabled = true;
            botao.textContent = "⏳ Criando...";
        }

        const resposta = await fetch("/new_chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({})
        });

        // Se o servidor redirecionou para login
        if (resposta.redirected) {

            window.location.href = resposta.url;

            return;
        }

        let dados;

        try {
            dados = await resposta.json();
        } catch (erro) {

            throw new Error(
                "O servidor não retornou JSON válido."
            );
        }

        if (!resposta.ok || !dados.success) {

            throw new Error(
                dados.message ||
                "Não foi possível criar uma nova conversa."
            );
        }

        // Limpa as mensagens antigas
        if (chat) {
            chat.innerHTML = "";
        }

        removerTyping();

        // Limpa o campo de texto
        if (mensagemInput) {
            mensagemInput.value = "";
            mensagemInput.focus();
        }

        // Remove arquivo selecionado
        limparArquivo();

        // Atualiza título
        const titulo = elemento("tituloConversa");

        if (titulo) {
            titulo.textContent =
                dados.title || "Nova conversa";
        }

        atualizarWelcome();

        console.log(
            "Nova conversa criada:",
            dados.conversation_id
        );

    } catch (erro) {

        console.error(
            "ERRO NOVA CONVERSA:",
            erro
        );

        alert(
            "❌ Não foi possível criar uma nova conversa.\n\n" +
            erro.message
        );

    } finally {

        enviando = false;

        if (botao) {
            botao.disabled = false;
            botao.textContent = textoOriginal || "🆕 Nova conversa";
        }
    }
}


// ============================================================
// ENVIAR MENSAGEM
// ============================================================

async function enviar() {

    if (enviando) {
        return;
    }

    if (!mensagemInput) {
        return;
    }

    const texto = mensagemInput.value.trim();

    if (!texto) {
        mensagemInput.focus();
        return;
    }

    enviando = true;

    if (btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.textContent = "Enviando...";
    }

    adicionarMensagem(texto, "user");

    mensagemInput.value = "";

    const typing = mostrarTyping();

    try {

        const resposta = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                message: texto
            })
        });

        if (resposta.redirected) {

            window.location.href = resposta.url;

            return;
        }

        let dados;

        try {
            dados = await resposta.json();
        } catch (erro) {

            throw new Error(
                "O servidor não retornou uma resposta válida."
            );
        }

        if (typing) {
            typing.remove();
        }

        if (!resposta.ok || !dados.success) {

            adicionarResposta(
                dados.reply ||
                dados.message ||
                "❌ Não foi possível obter uma resposta."
            );

            return;
        }

        adicionarResposta(
            dados.reply || "Não recebi uma resposta."
        );

    } catch (erro) {

        console.error(
            "ERRO AO ENVIAR:",
            erro
        );

        if (typing) {
            typing.remove();
        }

        adicionarResposta(
            "❌ Erro ao conectar com o servidor. Tente novamente."
        );

    } finally {

        enviando = false;

        if (btnEnviar) {
            btnEnviar.disabled = false;
            btnEnviar.textContent = "Enviar";
        }

        mensagemInput.focus();
    }
}


// ============================================================
// ENTER PARA ENVIAR
// ============================================================

if (mensagemInput) {

    mensagemInput.addEventListener(
        "keydown",
        function(event) {

            if (event.key === "Enter") {

                event.preventDefault();

                enviar();
            }
        }
    );
}


// ============================================================
// ATALHOS
// ============================================================

function atalho(texto) {

    if (!mensagemInput) {
        return;
    }

    mensagemInput.value = texto;

    mensagemInput.focus();

    enviar();
}


// ============================================================
// ARQUIVO
// ============================================================

if (btnArquivo && arquivoInput) {

    btnArquivo.addEventListener(
        "click",
        function() {

            arquivoInput.click();
        }
    );
}


if (arquivoInput) {

    arquivoInput.addEventListener(
        "change",
        function() {

            const arquivo =
                arquivoInput.files &&
                arquivoInput.files[0];

            if (!arquivo) {
                limparArquivo();
                return;
            }

            arquivoSelecionado = arquivo;

            if (nomeArquivo) {
                nomeArquivo.textContent =
                    arquivo.name;
            }

            if (arquivoBox) {
                arquivoBox.classList.add("ativo");
            }
        }
    );
}


function limparArquivo() {

    arquivoSelecionado = null;

    if (arquivoInput) {
        arquivoInput.value = "";
    }

    if (arquivoBox) {
        arquivoBox.classList.remove("ativo");
    }

    if (nomeArquivo) {
        nomeArquivo.textContent =
            "Nenhum arquivo selecionado";
    }
}


if (removerArquivo) {

    removerArquivo.addEventListener(
        "click",
        function() {

            limparArquivo();
        }
    );
}


// ============================================================
// VOZ
// ============================================================

let vozes = [];


function carregarVozes() {

    if (!("speechSynthesis" in window)) {

        const seletor = elemento("seletorVoz");

        if (seletor) {
            seletor.innerHTML =
                `<option value="">Voz não disponível</option>`;
        }

        return;
    }

    vozes =
        window.speechSynthesis.getVoices();

    const seletor =
        elemento("seletorVoz");

    if (!seletor) {
        return;
    }

    seletor.innerHTML = "";

    const vozesPT = vozes.filter(
        voz =>
            voz.lang &&
            voz.lang.toLowerCase().startsWith("pt")
    );

    const lista =
        vozesPT.length > 0
            ? vozesPT
            : vozes;

    if (lista.length === 0) {

        seletor.innerHTML =
            `<option value="">Nenhuma voz disponível</option>`;

        return;
    }

    lista.forEach(
        (voz, indice) => {

            const option =
                document.createElement("option");

            option.value =
                String(vozes.indexOf(voz));

            option.textContent =
                `${voz.name} (${voz.lang})`;

            seletor.appendChild(option);
        }
    );
}


if ("speechSynthesis" in window) {

    carregarVozes();

    window.speechSynthesis.onvoiceschanged =
        carregarVozes;
}


function falarResposta(texto) {

    const checkbox =
        elemento("voz");

    if (!checkbox || !checkbox.checked) {
        return;
    }

    if (!("speechSynthesis" in window)) {
        return;
    }

    const textoLimpo =
        String(texto)
            .replace(/```[\s\S]*?```/g, "")
            .replace(/[#*_>`]/g, "");

    if (!textoLimpo.trim()) {
        return;
    }

    window.speechSynthesis.cancel();

    const fala =
        new SpeechSynthesisUtterance(
            textoLimpo
        );

    const seletor =
        elemento("seletorVoz");

    if (seletor && seletor.value !== "") {

        const indice =
            Number(seletor.value);

        if (vozes[indice]) {
            fala.voice = vozes[indice];
        }
    }

    fala.lang = "pt-BR";
    fala.rate = 1;
    fala.pitch = 1;

    window.speechSynthesis.speak(fala);
}


// ============================================================
// TESTAR VOZ
// ============================================================

const btnTestarVoz =
    elemento("btnTestarVoz");


if (btnTestarVoz) {

    btnTestarVoz.addEventListener(
        "click",
        function() {

            falarResposta(
                "Olá! Eu sou o Orion AI. Esta é a minha voz."
            );
        }
    );
}


// ============================================================
// CARREGAR HISTÓRICO
// ============================================================

async function carregarHistorico() {

    if (!chat) {
        return;
    }

    try {

        const resposta =
            await fetch("/history", {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                },
                credentials: "same-origin"
            });

        if (resposta.redirected) {

            window.location.href =
                resposta.url;

            return;
        }

        if (!resposta.ok) {

            console.warn(
                "Erro ao carregar histórico:",
                resposta.status
            );

            atualizarWelcome();

            return;
        }

        const historico =
            await resposta.json();

        chat.innerHTML = "";

        historico.forEach(
            item => {

                if (item.sender === "user") {

                    adicionarMensagem(
                        item.message,
                        "user"
                    );

                } else {

                    adicionarResposta(
                        item.message
                    );
                }
            }
        );

        atualizarWelcome();

    } catch (erro) {

        console.error(
            "Erro ao carregar histórico:",
            erro
        );

        atualizarWelcome();
    }
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function() {

        atualizarWelcome();

        carregarHistorico();

        if (mensagemInput) {
            mensagemInput.focus();
        }

    }
);
````
