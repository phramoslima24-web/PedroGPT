
// ============================================================
// ORION AI - SCRIPT.JS
// ============================================================

let enviando = false;
let arquivoSelecionado = null;
let vozes = [];

let conversaSelecionada = null;
let modoSelecao = false;


// ============================================================
// CONFIGURAÇÕES
// ============================================================

const CHAVE_CONFIG =
    "orion_ai_config";

const configuracaoPadrao = {
    tema: "escuro",
    som: true,
    voz: "padrao",
    animacoes: true,
    enterEnviar: true
};


function obterConfiguracoes() {

    let config = {};

    try {

        config =
            JSON.parse(
                localStorage.getItem(
                    CHAVE_CONFIG
                )
            ) || {};

    } catch (erro) {

        config = {};

    }

    return {
        ...configuracaoPadrao,
        ...config
    };
}


function salvarConfiguracoes(config) {

    try {

        localStorage.setItem(
            CHAVE_CONFIG,
            JSON.stringify(config)
        );

    } catch (erro) {

        console.warn(
            "Não foi possível salvar configurações:",
            erro
        );
    }
}


function atualizarConfiguracao(
    chave,
    valor
) {

    const config =
        obterConfiguracoes();

    config[chave] =
        valor;

    salvarConfiguracoes(
        config
    );

    aplicarConfiguracoes();
}


// ============================================================
// ELEMENTOS
// ============================================================

function elemento(id) {
    return document.getElementById(id);
}

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
// CONFIGURAÇÕES - ELEMENTOS
// ============================================================

const configTema =
    elemento("configTema");

const configSom =
    elemento("configSom");

const configVoz =
    elemento("configVoz");

const configAnimacoes =
    elemento("configAnimacoes");

const configEnter =
    elemento("configEnter");

const vozChat =
    elemento("voz");

const seletorVoz =
    elemento("seletorVoz");

const btnAbrirConfiguracoes =
    elemento("btnAbrirConfiguracoes");

const painelConfiguracoes =
    elemento("painelConfiguracoes");

const btnFecharConfiguracoes =
    elemento("btnFecharConfiguracoes");

const btnConfiguracoesConta =
    elemento("btnConfiguracoesConta");


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
// WELCOME
// ============================================================

function atualizarWelcome() {

    if (!chat || !welcome) {
        return;
    }

    if (chat.children.length === 0) {

        welcome.classList.remove(
            "hidden"
        );

    } else {

        welcome.classList.add(
            "hidden"
        );
    }
}


// ============================================================
// ADICIONAR MENSAGEM DO USUÁRIO
// ============================================================

function adicionarMensagem(
    texto,
    tipo = "user"
) {

    if (!chat) {
        return null;
    }

    const div =
        document.createElement(
            "div"
        );

    div.className =
        tipo === "user"
            ? "msg-user"
            : "msg-bot";

    const conteudo =
        document.createElement(
            "div"
        );

    conteudo.className =
        "conteudo-mensagem";

    conteudo.textContent =
        texto;

    div.appendChild(
        conteudo
    );

    chat.appendChild(
        div
    );

    atualizarWelcome();

    chat.scrollTop =
        chat.scrollHeight;

    return div;
}


// ============================================================
// MARKDOWN
// ============================================================

function formatarResposta(texto) {

    let html =
        escaparHTML(texto);

    html = html.replace(
        /```([\s\S]*?)```/g,
        function (_, codigo) {

            return `
                <pre class="codigo-pedrogpt"><code>${codigo.trim()}</code></pre>
            `;
        }
    );

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

    html = html.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    html = html.replace(
        /\*(.*?)\*/g,
        "<em>$1</em>"
    );

    html = html.replace(
        /\n/g,
        "<br>"
    );

    return html;
}


// ============================================================
// ADICIONAR RESPOSTA DA IA
// ============================================================

function adicionarResposta(
    texto,
    falar = true
) {

    if (!chat) {
        return null;
    }

    const div =
        document.createElement(
            "div"
        );

    div.className =
        "msg-bot";

    if (
        obterConfiguracoes().animacoes === false
    ) {

        div.style.animation =
            "none";
    }

    const conteudo =
        document.createElement(
            "div"
        );

    conteudo.className =
        "conteudo-mensagem";

    conteudo.innerHTML =
        formatarResposta(
            texto
        );

    div.appendChild(
        conteudo
    );

    chat.appendChild(
        div
    );

    atualizarWelcome();

    chat.scrollTop =
        chat.scrollHeight;

    if (falar) {
        falarResposta(
            texto
        );
    }

    return div;
}


// ============================================================
// TYPING
// ============================================================

function mostrarTyping() {

    if (!chat) {
        return null;
    }

    removerTyping();

    const div =
        document.createElement(
            "div"
        );

    div.className =
        "msg-bot typing-message";

    div.id =
        "typingMessage";

    if (
        obterConfiguracoes().animacoes === false
    ) {

        div.style.animation =
            "none";
    }

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

    chat.appendChild(
        div
    );

    atualizarWelcome();

    chat.scrollTop =
        chat.scrollHeight;

    return div;
}


function removerTyping() {

    const typing =
        elemento("typingMessage");

    if (typing) {
        typing.remove();
    }
}


// ============================================================
// NOVA CONVERSA
// ============================================================

async function novaConversa() {

    if (enviando) {
        return;
    }

    sairModoSelecao();

    const botao =
        document.querySelector(
            ".nova-conversa"
        );

    const textoOriginal =
        botao
            ? botao.innerHTML
            : "🆕 Nova conversa";

    try {

        enviando = true;

        if (botao) {

            botao.disabled = true;

            botao.innerHTML =
                "⏳ Criando...";
        }

        const resposta =
            await fetch(
                "/new_chat",
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json",

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({})
                }
            );

        if (
            resposta.redirected
        ) {

            window.location.href =
                resposta.url;

            return;
        }

        const textoResposta =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(
                    textoResposta
                );

        } catch (erro) {

            console.error(
                "Resposta inválida:",
                textoResposta
            );

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (
            !resposta.ok ||
            !dados.success
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível criar uma nova conversa."
            );
        }

        if (
            dados.conversation_id
        ) {

            window.conversationId =
                dados.conversation_id;
        }

        if (chat) {
            chat.innerHTML = "";
        }

        removerTyping();

        if (mensagemInput) {
            mensagemInput.value = "";
        }

        limparArquivo();

        const titulo =
            elemento(
                "tituloConversa"
            );

        if (titulo) {

            titulo.textContent =
                dados.title ||
                "Nova conversa";
        }

        atualizarWelcome();

        await carregarHistoricoConversas();

        if (mensagemInput) {
            mensagemInput.focus();
        }

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

            botao.innerHTML =
                textoOriginal ||
                "🆕 Nova conversa";
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

    const texto =
        mensagemInput.value.trim();

    const temArquivo =
        arquivoSelecionado !== null;

    if (
        !texto &&
        !temArquivo
    ) {

        mensagemInput.focus();

        return;
    }

    enviando = true;

    if (btnEnviar) {

        btnEnviar.disabled =
            true;

        btnEnviar.textContent =
            "Enviando...";
    }

    if (texto) {

        adicionarMensagem(
            texto,
            "user"
        );

    } else {

        adicionarMensagem(
            "📷 Imagem enviada",
            "user"
        );
    }

    mensagemInput.value = "";

    const typing =
        mostrarTyping();

    try {

        const dadosEnvio = {
            message: texto
        };

        if (arquivoSelecionado) {

            const arquivo =
                arquivoSelecionado;

            if (
                arquivo.type &&
                arquivo.type.startsWith(
                    "image/"
                )
            ) {

                const base64 =
                    await converterArquivoBase64(
                        arquivo
                    );

                dadosEnvio.image =
                    base64.split(",")[1];

                dadosEnvio.image_type =
                    arquivo.type;

            } else {

                if (typing) {
                    typing.remove();
                }

                adicionarResposta(
                    "❌ No momento, o Orion AI aceita apenas imagens JPG, PNG, WEBP ou GIF."
                );

                return;
            }
        }

        const resposta =
            await fetch(
                "/chat",
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json",

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            dadosEnvio
                        )
                }
            );

        if (
            resposta.redirected
        ) {

            window.location.href =
                resposta.url;

            return;
        }

        const textoResposta =
            await resposta.text();

        let dados;

        try {

            dados =
                JSON.parse(
                    textoResposta
                );

        } catch (erro) {

            console.error(
                "Resposta do /chat:",
                textoResposta
            );

            throw new Error(
                "O servidor retornou uma resposta inválida."
            );
        }

        if (typing) {
            typing.remove();
        }

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            adicionarResposta(
                dados.reply ||
                dados.message ||
                "❌ Não foi possível obter uma resposta."
            );

            return;
        }

        if (
            dados.conversation_id
        ) {

            window.conversationId =
                dados.conversation_id;
        }

        adicionarResposta(
            dados.reply ||
            "Não recebi uma resposta da IA."
        );

        if (dados.title) {

            const titulo =
                elemento(
                    "tituloConversa"
                );

            if (titulo) {

                titulo.textContent =
                    dados.title;
            }
        }

        limparArquivo();

        carregarHistoricoConversas();

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

            btnEnviar.disabled =
                false;

            btnEnviar.textContent =
                "Enviar";
        }

        if (mensagemInput) {
            mensagemInput.focus();
        }
    }
}


// ============================================================
// CONVERTER ARQUIVO
// ============================================================

function converterArquivoBase64(
    arquivo
) {

    return new Promise(
        function (
            resolve,
            reject
        ) {

            const leitor =
                new FileReader();

            leitor.onload =
                function () {

                    resolve(
                        leitor.result
                    );
                };

            leitor.onerror =
                function () {

                    reject(
                        new Error(
                            "Não foi possível ler a imagem."
                        )
                    );
                };

            leitor.readAsDataURL(
                arquivo
            );
        }
    );
}


// ============================================================
// ENTER PARA ENVIAR
// ============================================================

// Usamos CAPTURE para conseguir bloquear
// qualquer listener anterior do index.html
// quando Enter estiver desativado.

if (mensagemInput) {

    mensagemInput.addEventListener(
        "keydown",
        function (event) {

            const config =
                obterConfiguracoes();

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                if (
                    config.enterEnviar
                ) {

                    event.preventDefault();

                    enviar();

                } else {

                    // Permite Enter normal quando
                    // a opção estiver desativada.
                    return;
                }
            }
        }
    );

}


// ============================================================
// BLOQUEAR ENTER DO INLINE QUANDO DESATIVADO
// ============================================================

document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.target !==
            mensagemInput
        ) {

            return;
        }

        const config =
            obterConfiguracoes();

        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            config.enterEnviar === false
        ) {

            event.stopImmediatePropagation();

        }

    },
    true
);


// ============================================================
// BOTÃO ENVIAR
// ============================================================

if (btnEnviar) {

    btnEnviar.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            enviar();
        }
    );
}


// ============================================================
// NOVA CONVERSA
// ============================================================

document.addEventListener(
    "click",
    function (event) {

        const botao =
            event.target.closest(
                ".nova-conversa"
            );

        if (!botao) {
            return;
        }

        event.preventDefault();

        novaConversa();
    }
);


// ============================================================
// ATALHOS
// ============================================================

function atalho(texto) {

    if (!mensagemInput) {
        return;
    }

    mensagemInput.value =
        texto;

    mensagemInput.focus();

    enviar();
}


// ============================================================
// ARQUIVO
// ============================================================

if (
    btnArquivo &&
    arquivoInput
) {

    btnArquivo.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            arquivoInput.click();
        }
    );
}


if (arquivoInput) {

    arquivoInput.addEventListener(
        "change",
        function () {

            const arquivo =
                arquivoInput.files &&
                arquivoInput.files[0];

            if (!arquivo) {

                limparArquivo();

                return;
            }

            if (
                arquivo.type &&
                !arquivo.type.startsWith(
                    "image/"
                )
            ) {

                alert(
                    "❌ Selecione uma imagem JPG, PNG, WEBP ou GIF."
                );

                limparArquivo();

                return;
            }

            if (
                arquivo.size >
                20 * 1024 * 1024
            ) {

                alert(
                    "❌ A imagem não pode ter mais de 20 MB."
                );

                limparArquivo();

                return;
            }

            arquivoSelecionado =
                arquivo;

            if (nomeArquivo) {

                nomeArquivo.textContent =
                    arquivo.name;
            }

            if (arquivoBox) {

                arquivoBox.classList.add(
                    "ativo"
                );
            }
        }
    );
}


// ============================================================
// LIMPAR ARQUIVO
// ============================================================

function limparArquivo() {

    arquivoSelecionado =
        null;

    if (arquivoInput) {
        arquivoInput.value = "";
    }

    if (arquivoBox) {

        arquivoBox.classList.remove(
            "ativo"
        );
    }

    if (nomeArquivo) {

        nomeArquivo.textContent =
            "Nenhum arquivo selecionado";
    }
}


if (removerArquivo) {

    removerArquivo.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            limparArquivo();
        }
    );
}


// ============================================================
// VOZES
// ============================================================

function carregarVozes() {

    const seletor =
        elemento("seletorVoz");

    if (
        !("speechSynthesis" in window)
    ) {

        if (seletor) {

            seletor.innerHTML =
                `<option value="">Voz não disponível</option>`;
        }

        return;
    }

    vozes =
        window.speechSynthesis
            .getVoices();

    if (!seletor) {
        return;
    }

    seletor.innerHTML = "";

    const vozesPT =
        vozes.filter(
            voz =>
                voz.lang &&
                voz.lang
                    .toLowerCase()
                    .startsWith("pt")
        );

    const lista =
        vozesPT.length
            ? vozesPT
            : vozes;

    if (!lista.length) {

        seletor.innerHTML =
            `<option value="default">Voz padrão do navegador</option>`;

        return;
    }

    const config =
        obterConfiguracoes();

    const opcaoPadrao =
        document.createElement(
            "option"
        );

    opcaoPadrao.value =
        "default";

    opcaoPadrao.textContent =
        "Voz padrão do navegador";

    seletor.appendChild(
        opcaoPadrao
    );

    lista.forEach(
        function (voz) {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                String(
                    vozes.indexOf(
                        voz
                    )
                );

            option.textContent =
                `${voz.name} (${voz.lang})`;

            seletor.appendChild(
                option
            );

        }
    );

    if (
        config.voz &&
        config.voz !== "padrao"
    ) {

        const indice =
            vozes.findIndex(
                function (voz) {

                    return (
                        voz.name +
                        "|" +
                        voz.lang
                    ) === config.voz;

                }
            );

        if (
            indice >= 0
        ) {

            seletor.value =
                String(indice);

        }

    } else {

        seletor.value =
            "default";
    }

    sincronizarVozConfiguracao();
}


if (
    "speechSynthesis" in window
) {

    carregarVozes();

    window.speechSynthesis
        .onvoiceschanged =
        carregarVozes;
}


// ============================================================
// SINCRONIZAR VOZ NO PAINEL
// ============================================================

function sincronizarVozConfiguracao() {

    if (
        !configVoz ||
        !seletorVoz
    ) {
        return;
    }

    const config =
        obterConfiguracoes();

    configVoz.value =
        config.voz;

}


// ============================================================
// ALTERAR VOZ PELO SELECT PRINCIPAL
// ============================================================

if (seletorVoz) {

    seletorVoz.addEventListener(
        "change",
        function () {

            const indice =
                Number(
                    seletorVoz.value
                );

            const config =
                obterConfiguracoes();

            if (
                seletorVoz.value ===
                "default"
            ) {

                config.voz =
                    "padrao";

            } else if (
                vozes[indice]
            ) {

                config.voz =
                    vozes[indice].name +
                    "|" +
                    vozes[indice].lang;
            }

            salvarConfiguracoes(
                config
            );

            sincronizarVozConfiguracao();

        }
    );
}


// ============================================================
// FALAR RESPOSTA
// ============================================================

function falarResposta(
    texto
) {

    const config =
        obterConfiguracoes();

    const checkbox =
        elemento("voz");

    const somAtivo =
        config.som &&
        (
            !checkbox ||
            checkbox.checked
        );

    if (!somAtivo) {
        return;
    }

    if (
        !("speechSynthesis" in window)
    ) {
        return;
    }

    const textoLimpo =
        String(texto)
            .replace(
                /```[\s\S]*?```/g,
                ""
            )
            .replace(
                /[#*_>`]/g,
                ""
            );

    if (!textoLimpo.trim()) {
        return;
    }

    window.speechSynthesis.cancel();

    const fala =
        new SpeechSynthesisUtterance(
            textoLimpo
        );

    let vozEscolhida =
        null;

    if (
        config.voz &&
        config.voz !== "padrao"
    ) {

        vozEscolhida =
            vozes.find(
                function (voz) {

                    return (
                        voz.name +
                        "|" +
                        voz.lang
                    ) === config.voz;

                }
            );

    }


    if (
        !vozEscolhida &&
        seletorVoz &&
        seletorVoz.value !== "default" &&
        seletorVoz.value !== ""
    ) {

        const indice =
            Number(
                seletorVoz.value
            );

        if (vozes[indice]) {

            vozEscolhida =
                vozes[indice];
        }
    }


    if (vozEscolhida) {

        fala.voice =
            vozEscolhida;

        fala.lang =
            vozEscolhida.lang;

    } else {

        fala.lang =
            "pt-BR";
    }

    fala.rate =
        1;

    fala.pitch =
        1;

    window.speechSynthesis.speak(
        fala
    );
}


// ============================================================
// TESTAR VOZ
// ============================================================

const btnTestarVoz =
    elemento(
        "btnTestarVoz"
    );

if (btnTestarVoz) {

    btnTestarVoz.addEventListener(
        "click",
        function () {

            const config =
                obterConfiguracoes();

            const configAntiga =
                config.som;

            config.som =
                true;

            salvarConfiguracoes(
                config
            );

            const checkbox =
                elemento("voz");

            const checkboxAntigo =
                checkbox
                    ? checkbox.checked
                    : true;

            if (checkbox) {
                checkbox.checked = true;
            }

            falarResposta(
                "Olá! Eu sou o Orion AI. Esta é a minha voz."
            );

            config.som =
                configAntiga;

            salvarConfiguracoes(
                config
            );

            if (checkbox) {

                checkbox.checked =
                    checkboxAntigo;
            }
        }
    );
}


// ============================================================
// VOZ CHAT - CHECKBOX
// ============================================================

if (vozChat) {

    vozChat.addEventListener(
        "change",
        function () {

            atualizarConfiguracao(
                "som",
                vozChat.checked
            );

            if (configSom) {

                configSom.checked =
                    vozChat.checked;
            }

            if (
                !vozChat.checked &&
                "speechSynthesis" in window
            ) {

                window.speechSynthesis.cancel();
            }

        }
    );
}


// ============================================================
// HISTÓRICO - CARREGAR CONVERSA ATUAL
// ============================================================

async function carregarHistorico() {

    if (!chat) {
        return;
    }

    try {

        const resposta =
            await fetch(
                "/history",
                {
                    method: "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (
            resposta.status ===
            401
        ) {

            window.location.href =
                "/login";

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

        if (
            Array.isArray(
                historico
            )
        ) {

            historico.forEach(
                function (item) {

                    if (
                        item.sender ===
                        "user"
                    ) {

                        adicionarMensagem(
                            item.message,
                            "user"
                        );

                    } else {

                        adicionarResposta(
                            item.message,
                            false
                        );
                    }

                }
            );
        }

        atualizarWelcome();

        chat.scrollTop =
            chat.scrollHeight;

    } catch (erro) {

        console.error(
            "ERRO AO CARREGAR HISTÓRICO:",
            erro
        );

        atualizarWelcome();
    }
}


// ============================================================
// HISTÓRICO - LISTA DE CONVERSAS
// ============================================================

async function carregarHistoricoConversas() {

    const container =
        elemento(
            "historicoConversas"
        );

    if (!container) {
        return;
    }

    try {

        const resposta =
            await fetch(
                "/conversations",
                {
                    method: "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (
            resposta.status ===
            401
        ) {

            window.location.href =
                "/login";

            return;
        }

        if (!resposta.ok) {

            console.warn(
                "Erro ao carregar conversas:",
                resposta.status
            );

            container.innerHTML = `
                <div class="historico-vazio">
                    Erro ao carregar conversas
                </div>
            `;

            return;
        }

        const dados =
            await resposta.json();

        const conversas =
            Array.isArray(dados)
                ? dados
                : dados.conversations ||
                  [];

        container.innerHTML = "";

        if (
            !conversas.length
        ) {

            container.innerHTML = `
                <div class="historico-vazio">
                    Nenhuma conversa ainda
                </div>
            `;

            return;
        }

        conversas.forEach(
            function (conversa) {

                criarItemConversa(
                    conversa
                );

            }
        );

        atualizarSelecaoVisual();

    } catch (erro) {

        console.error(
            "ERRO AO CARREGAR CONVERSAS:",
            erro
        );

        container.innerHTML = `
            <div class="historico-vazio">
                Erro ao carregar conversas
            </div>
        `;
    }
}


// ============================================================
// CRIAR ITEM DA CONVERSA
// ============================================================

function criarItemConversa(
    conversa
) {

    const container =
        elemento(
            "historicoConversas"
        );

    if (!container) {
        return;
    }

    const id =
        conversa.id ||
        conversa.conversation_id;

    const titulo =
        conversa.title ||
        conversa.titulo ||
        "Nova conversa";

    const item =
        document.createElement(
            "div"
        );

    item.className =
        "conversa-item";

    item.dataset.id =
        id;

    const abrir =
        document.createElement(
            "button"
        );

    abrir.type =
        "button";

    abrir.className =
        "conversa-abrir";

    abrir.innerHTML = `
        <span class="conversa-titulo">
            ${escaparHTML(titulo)}
        </span>
    `;

    abrir.addEventListener(
        "click",
        function () {

            if (modoSelecao) {

                alternarSelecaoConversa(
                    id,
                    item
                );

                return;
            }

            abrirConversa(
                id
            );

        }
    );

    const acoes =
        document.createElement(
            "div"
        );

    acoes.className =
        "conversa-acoes";


    // --------------------------------------------------------
    // SELECIONAR
    // --------------------------------------------------------

    const btnSelecionar =
        document.createElement(
            "button"
        );

    btnSelecionar.type =
        "button";

    btnSelecionar.className =
        "btn-conversa btn-selecionar";

    btnSelecionar.title =
        "Selecionar";

    btnSelecionar.textContent =
        "☐";

    btnSelecionar.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            alternarSelecaoConversa(
                id,
                item
            );

        }
    );


    // --------------------------------------------------------
    // RENOMEAR
    // --------------------------------------------------------

    const btnRenomear =
        document.createElement(
            "button"
        );

    btnRenomear.type =
        "button";

    btnRenomear.className =
        "btn-conversa btn-renomear";

    btnRenomear.title =
        "Renomear";

    btnRenomear.textContent =
        "✏️";

    btnRenomear.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            renomearConversa(
                id,
                titulo
            );

        }
    );


    // --------------------------------------------------------
    // EXCLUIR
    // --------------------------------------------------------

    const btnExcluir =
        document.createElement(
            "button"
        );

    btnExcluir.type =
        "button";

    btnExcluir.className =
        "btn-conversa btn-excluir";

    btnExcluir.title =
        "Excluir";

    btnExcluir.textContent =
        "🗑️";

    btnExcluir.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            excluirConversa(
                id
            );

        }
    );


    acoes.appendChild(
        btnSelecionar
    );

    acoes.appendChild(
        btnRenomear
    );

    acoes.appendChild(
        btnExcluir
    );

    item.appendChild(
        abrir
    );

    item.appendChild(
        acoes
    );

    container.appendChild(
        item
    );
}


// ============================================================
// ABRIR CONVERSA
// ============================================================

async function abrirConversa(id) {

    if (modoSelecao) {
        return;
    }

    if (!id) {
        return;
    }

    try {

        const resposta =
            await fetch(
                `/conversation/${encodeURIComponent(id)}`,
                {
                    method: "GET",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (
            resposta.status ===
            401
        ) {

            window.location.href =
                "/login";

            return;
        }

        const dados =
            await resposta.json();

        if (!resposta.ok) {

            alert(
                dados.message ||
                "❌ Não foi possível abrir a conversa."
            );

            return;
        }

        window.conversationId =
            id;

        if (chat) {
            chat.innerHTML = "";
        }

        const mensagens =
            dados.messages ||
            dados.history ||
            [];

        mensagens.forEach(
            function (item) {

                if (
                    item.sender ===
                    "user"
                ) {

                    adicionarMensagem(
                        item.message,
                        "user"
                    );

                } else {

                    adicionarResposta(
                        item.message,
                        false
                    );
                }

            }
        );

        const titulo =
            elemento(
                "tituloConversa"
            );

        if (titulo) {

            titulo.textContent =
                dados.title ||
                dados.titulo ||
                "Orion AI";
        }

        document
            .querySelectorAll(
                ".conversa-item"
            )
            .forEach(
                function (item) {

                    item.classList.toggle(
                        "ativa",
                        String(
                            item.dataset.id
                        ) === String(id)
                    );

                }
            );

        atualizarWelcome();

        if (chat) {

            chat.scrollTop =
                chat.scrollHeight;
        }

    } catch (erro) {

        console.error(
            "ERRO AO ABRIR CONVERSA:",
            erro
        );

        alert(
            "❌ Erro ao abrir a conversa."
        );
    }
}


// ============================================================
// RENOMEAR CONVERSA
// ============================================================

async function renomearConversa(
    id,
    tituloAtual
) {

    const novoTitulo =
        prompt(
            "Digite o novo nome da conversa:",
            tituloAtual
        );

    if (
        novoTitulo ===
        null
    ) {
        return;
    }

    const titulo =
        novoTitulo.trim();

    if (!titulo) {

        alert(
            "❌ O nome não pode ficar vazio."
        );

        return;
    }

    try {

        const resposta =
            await fetch(
                "/rename_conversation",
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json",

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            conversation_id:
                                id,

                            title:
                                titulo
                        })
                }
            );

        const dados =
            await resposta.json();

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível renomear."
            );
        }

        const item =
            document.querySelector(
                `.conversa-item[data-id="${CSS.escape(String(id))}"]`
            );

        if (item) {

            const tituloElemento =
                item.querySelector(
                    ".conversa-titulo"
                );

            if (tituloElemento) {

                tituloElemento.textContent =
                    titulo;
            }
        }

        if (
            String(
                window.conversationId
            ) ===
            String(id)
        ) {

            const tituloHeader =
                elemento(
                    "tituloConversa"
                );

            if (tituloHeader) {

                tituloHeader.textContent =
                    titulo;
            }
        }

    } catch (erro) {

        console.error(
            "ERRO AO RENOMEAR:",
            erro
        );

        alert(
            "❌ " +
            erro.message
        );
    }
}


// ============================================================
// EXCLUIR CONVERSA
// ============================================================

async function excluirConversa(
    id
) {

    if (!id) {
        return;
    }

    const confirmar =
        confirm(
            "⚠️ Tem certeza que deseja excluir esta conversa?\n\n" +
            "As mensagens serão apagadas permanentemente."
        );

    if (!confirmar) {
        return;
    }

    try {

        const resposta =
            await fetch(
                "/delete_conversation",
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json",

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            conversation_id:
                                id
                        })
                }
            );

        const dados =
            await resposta.json();

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível excluir a conversa."
            );
        }

        if (
            String(
                window.conversationId
            ) ===
            String(id)
        ) {

            window.conversationId =
                null;

            if (chat) {
                chat.innerHTML = "";
            }

            const titulo =
                elemento(
                    "tituloConversa"
                );

            if (titulo) {

                titulo.textContent =
                    "Orion AI";
            }

            atualizarWelcome();
        }

        await carregarHistoricoConversas();

    } catch (erro) {

        console.error(
            "ERRO AO EXCLUIR:",
            erro
        );

        alert(
            "❌ " +
            erro.message
        );
    }
}


// ============================================================
// BARRA DE SELEÇÃO
// ============================================================

function criarBarraSelecao() {

    if (
        elemento("barraSelecao")
    ) {
        return;
    }

    const sidebar =
        document.querySelector(
            ".sidebar"
        );

    const historicoTitulo =
        document.querySelector(
            ".historico-titulo"
        );

    if (
        !sidebar ||
        !historicoTitulo
    ) {
        return;
    }

    const barra =
        document.createElement(
            "div"
        );

    barra.id =
        "barraSelecao";

    barra.style.display =
        "none";

    barra.style.flexDirection =
        "column";

    barra.style.gap =
        "7px";

    barra.innerHTML = `

        <div style="
            display:flex;
            gap:6px;
        ">

            <button
                type="button"
                id="btnSelecionarTudo"
                style="
                    flex:1;
                    border:none;
                    padding:8px;
                    border-radius:8px;
                    background:rgba(255,255,255,.07);
                    color:white;
                    cursor:pointer;
                    font-size:12px;
                "
            >
                ☑️ Selecionar tudo
            </button>

            <button
                type="button"
                id="btnCancelarSelecao"
                style="
                    flex:1;
                    border:none;
                    padding:8px;
                    border-radius:8px;
                    background:rgba(255,255,255,.07);
                    color:white;
                    cursor:pointer;
                    font-size:12px;
                "
            >
                ❌ Cancelar
            </button>

        </div>

        <button
            type="button"
            id="btnExcluirSelecionadas"
            style="
                border:none;
                padding:9px;
                border-radius:8px;
                background:rgba(239,68,68,.18);
                border:1px solid rgba(239,68,68,.25);
                color:#fca5a5;
                cursor:pointer;
                font-weight:bold;
                font-size:12px;
            "
        >
            🗑️ Excluir selecionadas (<span id="contadorSelecionadas">0</span>)
        </button>
    `;

    sidebar.insertBefore(
        barra,
        historicoTitulo
    );

    elemento(
        "btnSelecionarTudo"
    ).addEventListener(
        "click",
        selecionarTodasConversas
    );

    elemento(
        "btnCancelarSelecao"
    ).addEventListener(
        "click",
        sairModoSelecao
    );

    elemento(
        "btnExcluirSelecionadas"
    ).addEventListener(
        "click",
        excluirSelecionadas
    );
}


// ============================================================
// MODO SELEÇÃO
// ============================================================

function entrarModoSelecao() {

    modoSelecao =
        true;

    criarBarraSelecao();

    const barra =
        elemento(
            "barraSelecao"
        );

    if (barra) {

        barra.style.display =
            "flex";
    }

    atualizarSelecaoVisual();
}


function sairModoSelecao() {

    modoSelecao =
        false;

    document
        .querySelectorAll(
            ".conversa-item.selecionada"
        )
        .forEach(
            function (item) {

                item.classList.remove(
                    "selecionada"
                );
            }
        );

    const barra =
        elemento(
            "barraSelecao"
        );

    if (barra) {

        barra.style.display =
            "none";
    }

    atualizarSelecaoVisual();
}


// ============================================================
// SELECIONAR / DESSELECIONAR
// ============================================================

function alternarSelecaoConversa(
    id,
    item
) {

    if (!modoSelecao) {
        entrarModoSelecao();
    }

    item.classList.toggle(
        "selecionada"
    );

    atualizarSelecaoVisual();
}


// ============================================================
// VISUAL SELEÇÃO
// ============================================================

function atualizarSelecaoVisual() {

    const itens =
        document.querySelectorAll(
            ".conversa-item"
        );

    itens.forEach(
        function (item) {

            const selecionada =
                item.classList.contains(
                    "selecionada"
                );

            const botao =
                item.querySelector(
                    ".btn-selecionar"
                );

            if (botao) {

                botao.textContent =
                    selecionada
                        ? "☑️"
                        : "☐";
            }

            if (modoSelecao) {

                item.style.background =
                    selecionada
                        ? "rgba(124,58,237,.28)"
                        : "";

            } else {

                item.style.background =
                    "";
            }

        }
    );

    const selecionadas =
        document.querySelectorAll(
            ".conversa-item.selecionada"
        );

    const contador =
        elemento(
            "contadorSelecionadas"
        );

    if (contador) {

        contador.textContent =
            selecionadas.length;
    }
}


// ============================================================
// SELECIONAR TODAS
// ============================================================

function selecionarTodasConversas() {

    entrarModoSelecao();

    const itens =
        document.querySelectorAll(
            ".conversa-item"
        );

    itens.forEach(
        function (item) {

            item.classList.add(
                "selecionada"
            );
        }
    );

    atualizarSelecaoVisual();
}


// ============================================================
// IDS SELECIONADOS
// ============================================================

function obterIdsSelecionados() {

    return Array.from(
        document.querySelectorAll(
            ".conversa-item.selecionada"
        )
    )
        .map(
            item =>
                item.dataset.id
        )
        .filter(Boolean);
}


// ============================================================
// EXCLUIR VÁRIAS
// ============================================================

async function excluirSelecionadas() {

    const ids =
        obterIdsSelecionados();

    if (!ids.length) {

        alert(
            "⚠️ Selecione pelo menos uma conversa."
        );

        return;
    }

    const confirmar =
        confirm(
            `⚠️ Você selecionou ${ids.length} conversa(s).\n\n` +
            "Todas as mensagens dessas conversas serão apagadas permanentemente.\n\n" +
            "Deseja continuar?"
        );

    if (!confirmar) {
        return;
    }

    const botao =
        elemento(
            "btnExcluirSelecionadas"
        );

    if (botao) {

        botao.disabled =
            true;

        botao.textContent =
            "⏳ Excluindo...";
    }

    try {

        const resposta =
            await fetch(
                "/delete_conversations",
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        "Accept":
                            "application/json",

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            conversation_ids:
                                ids
                        })
                }
            );

        const dados =
            await resposta.json();

        if (
            !resposta.ok ||
            dados.success === false
        ) {

            throw new Error(
                dados.message ||
                "Não foi possível excluir as conversas."
            );
        }

        if (
            window.conversationId &&
            ids.some(
                id =>
                    String(id) ===
                    String(
                        window.conversationId
                    )
            )
        ) {

            window.conversationId =
                null;

            if (chat) {
                chat.innerHTML = "";
            }

            const titulo =
                elemento(
                    "tituloConversa"
                );

            if (titulo) {

                titulo.textContent =
                    "Orion AI";
            }

            atualizarWelcome();
        }

        sairModoSelecao();

        await carregarHistoricoConversas();

    } catch (erro) {

        console.error(
            "ERRO AO EXCLUIR VÁRIAS:",
            erro
        );

        alert(
            "❌ " +
            erro.message
        );

    } finally {

        if (botao) {

            botao.disabled =
                false;

            botao.innerHTML =
                `🗑️ Excluir selecionadas (<span id="contadorSelecionadas">0</span>)`;
        }
    }
}


// ============================================================
// DUPLO CLIQUE PARA SELEÇÃO
// ============================================================

document.addEventListener(
    "dblclick",
    function (event) {

        const item =
            event.target.closest(
                ".conversa-item"
            );

        if (!item) {
            return;
        }

        entrarModoSelecao();

        item.classList.add(
            "selecionada"
        );

        atualizarSelecaoVisual();
    }
);


// ============================================================
// CONFIGURAÇÕES - PAINEL
// ============================================================

function aplicarConfiguracoes() {

    const config =
        obterConfiguracoes();


    // --------------------------------------------------------
    // TEMA
    // --------------------------------------------------------

    if (
        config.tema ===
        "claro"
    ) {

        document.body.classList.add(
            "tema-claro"
        );

    } else {

        document.body.classList.remove(
            "tema-claro"
        );
    }


    // --------------------------------------------------------
    // SOM
    // --------------------------------------------------------

    if (vozChat) {

        vozChat.checked =
            Boolean(
                config.som
            );
    }

    if (configSom) {

        configSom.checked =
            Boolean(
                config.som
            );
    }


    // --------------------------------------------------------
    // TEMA SELECT
    // --------------------------------------------------------

    if (configTema) {

        configTema.value =
            config.tema;
    }


    // --------------------------------------------------------
    // ANIMAÇÕES
    // --------------------------------------------------------

    if (configAnimacoes) {

        configAnimacoes.checked =
            Boolean(
                config.animacoes
            );
    }


    // --------------------------------------------------------
    // ENTER
    // --------------------------------------------------------

    if (configEnter) {

        configEnter.checked =
            Boolean(
                config.enterEnviar
            );
    }


    // --------------------------------------------------------
    // VOZ
    // --------------------------------------------------------

    sincronizarVozConfiguracao();


    // --------------------------------------------------------
    // CANCELAR FALA SE SOM DESLIGADO
    // --------------------------------------------------------

    if (
        config.som === false &&
        "speechSynthesis" in window
    ) {

        window.speechSynthesis.cancel();
    }

}


// ============================================================
// PAINEL ABRIR
// ============================================================

if (
    btnAbrirConfiguracoes
) {

    btnAbrirConfiguracoes.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();

            if (painelConfiguracoes) {

                painelConfiguracoes.classList.toggle(
                    "aberto"
                );
            }

        }
    );
}


// ============================================================
// FECHAR CONFIGURAÇÕES
// ============================================================

if (
    btnFecharConfiguracoes
) {

    btnFecharConfiguracoes.addEventListener(
        "click",
        function () {

            if (painelConfiguracoes) {

                painelConfiguracoes.classList.remove(
                    "aberto"
                );
            }

        }
    );
}


// ============================================================
// CLICAR FORA
// ============================================================

document.addEventListener(
    "click",
    function (event) {

        if (
            !painelConfiguracoes ||
            !btnAbrirConfiguracoes
        ) {
            return;
        }

        if (
            painelConfiguracoes.contains(
                event.target
            )
        ) {
            return;
        }

        if (
            event.target ===
            btnAbrirConfiguracoes
        ) {
            return;
        }

        painelConfiguracoes.classList.remove(
            "aberto"
        );
    }
);


// ============================================================
// CONFIG TEMA
// ============================================================

if (configTema) {

    configTema.addEventListener(
        "change",
        function () {

            atualizarConfiguracao(
                "tema",
                configTema.value
            );
        }
    );
}


// ============================================================
// CONFIG SOM
// ============================================================

if (configSom) {

    configSom.addEventListener(
        "change",
        function () {

            atualizarConfiguracao(
                "som",
                configSom.checked
            );

            if (vozChat) {

                vozChat.checked =
                    configSom.checked;
            }

            if (
                !configSom.checked &&
                "speechSynthesis" in window
            ) {

                window.speechSynthesis.cancel();
            }

        }
    );
}


// ============================================================
// CONFIG VOZ
// ============================================================

if (configVoz) {

    configVoz.addEventListener(
        "change",
        function () {

            const valor =
                configVoz.value;

            atualizarConfiguracao(
                "voz",
                valor
            );

            aplicarVozConfigurada();

        }
    );
}


// ============================================================
// APLICAR VOZ CONFIGURADA
// ============================================================

function aplicarVozConfigurada() {

    const config =
        obterConfiguracoes();

    if (!seletorVoz) {
        return;
    }

    if (
        config.voz ===
        "padrao"
    ) {

        seletorVoz.value =
            "default";

        return;
    }

    const indice =
        vozes.findIndex(
            function (voz) {

                return (
                    voz.name +
                    "|" +
                    voz.lang
                ) === config.voz;

            }
        );

    if (indice >= 0) {

        seletorVoz.value =
            String(indice);
    }
}


// ============================================================
// CONFIG ANIMAÇÕES
// ============================================================

if (configAnimacoes) {

    configAnimacoes.addEventListener(
        "change",
        function () {

            atualizarConfiguracao(
                "animacoes",
                configAnimacoes.checked
            );

        }
    );
}


// ============================================================
// CONFIG ENTER
// ============================================================

if (configEnter) {

    configEnter.addEventListener(
        "change",
        function () {

            atualizarConfiguracao(
                "enterEnviar",
                configEnter.checked
            );

        }
    );
}


// ============================================================
// CONFIGURAÇÕES DA CONTA
// ============================================================

if (btnConfiguracoesConta) {

    btnConfiguracoesConta.addEventListener(
        "click",
        function () {

            window.location.href =
                "/perfil";

        }
    );
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        aplicarConfiguracoes();

        criarBarraSelecao();

        atualizarWelcome();

        carregarHistorico();

        carregarHistoricoConversas();

        carregarVozes();

        if (mensagemInput) {

            mensagemInput.focus();
        }

    }
);


// ============================================================
// EXPOR FUNÇÕES
// ============================================================

window.enviar =
    enviar;

window.novaConversa =
    novaConversa;

window.atalho =
    atalho;

window.limparArquivo =
    limparArquivo;

window.carregarHistorico =
    carregarHistorico;

window.carregarHistoricoConversas =
    carregarHistoricoConversas;

window.abrirConversa =
    abrirConversa;

window.renomearConversa =
    renomearConversa;

window.excluirConversa =
    excluirConversa;

window.entrarModoSelecao =
    entrarModoSelecao;

window.sairModoSelecao =
    sairModoSelecao;

window.excluirSelecionadas =
    excluirSelecionadas;

window.falarResposta =
    falarResposta;

window.obterConfiguracoes =
    obterConfiguracoes;

window.salvarConfiguracoes =
    salvarConfiguracoes;

