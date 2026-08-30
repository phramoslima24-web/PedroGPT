
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

const ORION_CHAVE_CONFIG =
    "orion_ai_config";

const ORION_CONFIG_PADRAO = {

    tema:
        "escuro",

    som:
        true,

    voz:
        "padrao",

    animacoes:
        true,

    enterEnviar:
        true
};


function orionObterConfiguracoes() {

    let config = {};

    try {

        config =
            JSON.parse(
                localStorage.getItem(
                    ORION_CHAVE_CONFIG
                )
            ) || {};

    } catch (erro) {

        config = {};
    }

    return {
        ...ORION_CONFIG_PADRAO,
        ...config
    };
}


function orionSalvarConfiguracoes(
    config
) {

    try {

        localStorage.setItem(
            ORION_CHAVE_CONFIG,
            JSON.stringify(config)
        );

    } catch (erro) {

        console.warn(
            "Não foi possível salvar configurações:",
            erro
        );
    }
}


function orionAtualizarConfiguracao(
    chave,
    valor
) {

    const config =
        orionObterConfiguracoes();

    config[chave] =
        valor;

    orionSalvarConfiguracoes(
        config
    );

    orionAplicarConfiguracoes();
}


// ============================================================
// ELEMENTOS
// ============================================================

function elemento(id) {

    return document.getElementById(id);
}


const chat =
    elemento("chat");

const welcome =
    elemento("welcome");

const mensagemInput =
    elemento("mensagem");

const btnEnviar =
    elemento("btnEnviar");

const btnArquivo =
    elemento("btnArquivo");

const arquivoInput =
    elemento("arquivo");

const arquivoBox =
    elemento("arquivoSelecionado");

const nomeArquivo =
    elemento("nomeArquivo");

const removerArquivo =
    elemento("removerArquivo");


// ============================================================
// ELEMENTOS DAS CONFIGURAÇÕES
// ============================================================

const orionConfigTema =
    elemento("configTema");

const orionConfigSom =
    elemento("configSom");

const orionConfigVoz =
    elemento("configVoz");

const orionConfigAnimacoes =
    elemento("configAnimacoes");

const orionConfigEnter =
    elemento("configEnter");

const orionVozChat =
    elemento("voz");

const orionSeletorVoz =
    elemento("seletorVoz");

const orionBtnAbrirConfiguracoes =
    elemento("btnAbrirConfiguracoes");

const orionPainelConfiguracoes =
    elemento("painelConfiguracoes");

const orionBtnFecharConfiguracoes =
    elemento("btnFecharConfiguracoes");

const orionBtnConfiguracoesConta =
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

    if (
        chat.children.length === 0
    ) {

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
// ADICIONAR MENSAGEM
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

    if (
        orionObterConfiguracoes()
            .animacoes === false
    ) {

        div.style.animation =
            "none";
    }

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
// ADICIONAR RESPOSTA
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
        orionObterConfiguracoes()
            .animacoes === false
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
        orionObterConfiguracoes()
            .animacoes === false
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
        elemento(
            "typingMessage"
        );

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

        enviando =
            true;


        if (botao) {

            botao.disabled =
                true;

            botao.innerHTML =
                "⏳ Criando...";
        }


        const resposta =
            await fetch(
                "/new_chat",
                {
                    method:
                        "POST",

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

            chat.innerHTML =
                "";
        }


        removerTyping();


        if (mensagemInput) {

            mensagemInput.value =
                "";
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

        enviando =
            false;


        if (botao) {

            botao.disabled =
                false;

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


    enviando =
        true;


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


    mensagemInput.value =
        "";


    const typing =
        mostrarTyping();


    try {

        const dadosEnvio = {

            message:
                texto

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
                    method:
                        "POST",

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

        enviando =
            false;


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
// ENTER
// ============================================================

if (mensagemInput) {

    mensagemInput.addEventListener(
        "keydown",
        function (event) {

            const config =
                orionObterConfiguracoes();


            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                if (
                    config.enterEnviar
                ) {

                    event.preventDefault();

                    event.stopPropagation();

                    enviar();

                }

            }
        }
    );
}


// ============================================================
// BLOQUEAR ENTER QUANDO DESATIVADO
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
            orionObterConfiguracoes();


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

        arquivoInput.value =
            "";
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

    if (
        !("speechSynthesis" in window)
    ) {

        if (
            orionSeletorVoz
        ) {

            orionSeletorVoz.innerHTML =
                `<option value="">Voz não disponível</option>`;
        }

        return;
    }


    vozes =
        window.speechSynthesis.getVoices();


    if (!orionSeletorVoz) {

        return;
    }


    const valorAtual =
        orionObterConfiguracoes()
            .voz;


    orionSeletorVoz.innerHTML =
        `
        <option value="default">
            Voz padrão do navegador
        </option>
        `;


    const vozesPT =
        vozes.filter(
            function (voz) {

                return (
                    voz.lang &&
                    voz.lang
                        .toLowerCase()
                        .startsWith("pt")
                );
            }
        );


    const lista =
        vozesPT.length
            ? vozesPT
            : vozes;


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


            orionSeletorVoz.appendChild(
                option
            );
        }
    );


    orionAplicarVozConfigurada();


    if (
        orionConfigVoz &&
        valorAtual
    ) {

        orionConfigVoz.value =
            valorAtual;
    }
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
// APLICAR VOZ CONFIGURADA
// ============================================================

function orionAplicarVozConfigurada() {

    const config =
        orionObterConfiguracoes();


    if (
        orionSeletorVoz
    ) {

        if (
            config.voz ===
            "padrao"
        ) {

            orionSeletorVoz.value =
                "default";

        } else {

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

                orionSeletorVoz.value =
                    String(indice);

            } else {

                orionSeletorVoz.value =
                    "default";
            }
        }
    }


    if (
        orionConfigVoz
    ) {

        orionConfigVoz.value =
            config.voz;
    }
}


// ============================================================
// SELECT PRINCIPAL DE VOZ
// ============================================================

if (
    orionSeletorVoz
) {

    orionSeletorVoz.addEventListener(
        "change",
        function () {

            const config =
                orionObterConfiguracoes();


            if (
                orionSeletorVoz.value ===
                "default"
            ) {

                config.voz =
                    "padrao";

            } else {

                const indice =
                    Number(
                        orionSeletorVoz.value
                    );


                if (
                    vozes[indice]
                ) {

                    config.voz =
                        vozes[indice].name +
                        "|" +
                        vozes[indice].lang;
                }
            }


            orionSalvarConfiguracoes(
                config
            );


            orionAplicarVozConfigurada();

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
        orionObterConfiguracoes();


    if (
        config.som !== true
    ) {

        return;
    }


    if (
        "speechSynthesis" in window ===
        false
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


    if (
        !textoLimpo.trim()
    ) {

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
        orionSeletorVoz &&
        orionSeletorVoz.value !==
            "default"
    ) {

        const indice =
            Number(
                orionSeletorVoz.value
            );


        if (
            vozes[indice]
        ) {

            vozEscolhida =
                vozes[indice];
        }
    }


    if (
        vozEscolhida
    ) {

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

const orionBtnTestarVoz =
    elemento(
        "btnTestarVoz"
    );


if (
    orionBtnTestarVoz
) {

    orionBtnTestarVoz.addEventListener(
        "click",
        function () {

            const config =
                orionObterConfiguracoes();


            const somAnterior =
                config.som;


            config.som =
                true;


            orionSalvarConfiguracoes(
                config
            );


            if (
                orionVozChat
            ) {

                orionVozChat.checked =
                    true;
            }


            falarResposta(
                "Olá! Eu sou o Orion AI. Esta é a minha voz."
            );


            config.som =
                somAnterior;


            orionSalvarConfiguracoes(
                config
            );


            if (
                orionVozChat
            ) {

                orionVozChat.checked =
                    somAnterior;
            }
        }
    );
}


// ============================================================
// VOZ - CHECKBOX DO CHAT
// ============================================================

if (
    orionVozChat
) {

    orionVozChat.addEventListener(
        "change",
        function () {

            orionAtualizarConfiguracao(
                "som",
                orionVozChat.checked
            );


            if (
                orionConfigSom
            ) {

                orionConfigSom.checked =
                    orionVozChat.checked;
            }


            if (
                !orionVozChat.checked &&
                "speechSynthesis" in window
            ) {

                window.speechSynthesis.cancel();
            }
        }
    );
}


// ============================================================
// APLICAR TODAS AS CONFIGURAÇÕES
// ============================================================

function orionAplicarConfiguracoes() {

    const config =
        orionObterConfiguracoes();


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

    if (
        orionVozChat
    ) {

        orionVozChat.checked =
            Boolean(
                config.som
            );
    }


    if (
        orionConfigSom
    ) {

        orionConfigSom.checked =
            Boolean(
                config.som
            );
    }


    // --------------------------------------------------------
    // TEMA
    // --------------------------------------------------------

    if (
        orionConfigTema
    ) {

        orionConfigTema.value =
            config.tema;
    }


    // --------------------------------------------------------
    // ANIMAÇÕES
    // --------------------------------------------------------

    if (
        orionConfigAnimacoes
    ) {

        orionConfigAnimacoes.checked =
            Boolean(
                config.animacoes
            );
    }


    // --------------------------------------------------------
    // ENTER
    // --------------------------------------------------------

    if (
        orionConfigEnter
    ) {

        orionConfigEnter.checked =
            Boolean(
                config.enterEnviar
            );
    }


    // --------------------------------------------------------
    // VOZ
    // --------------------------------------------------------

    orionAplicarVozConfigurada();


    // --------------------------------------------------------
    // DESLIGAR FALA
    // --------------------------------------------------------

    if (
        config.som === false &&
        "speechSynthesis" in window
    ) {

        window.speechSynthesis.cancel();
    }
}


// ============================================================
// ABRIR PAINEL
// ============================================================

if (
    orionBtnAbrirConfiguracoes
) {

    orionBtnAbrirConfiguracoes.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();


            if (
                orionPainelConfiguracoes
            ) {

                orionPainelConfiguracoes.classList.toggle(
                    "aberto"
                );
            }
        }
    );
}


// ============================================================
// FECHAR PAINEL
// ============================================================

if (
    orionBtnFecharConfiguracoes
) {

    orionBtnFecharConfiguracoes.addEventListener(
        "click",
        function () {

            if (
                orionPainelConfiguracoes
            ) {

                orionPainelConfiguracoes.classList.remove(
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
            !orionPainelConfiguracoes ||
            !orionBtnAbrirConfiguracoes
        ) {

            return;
        }


        if (
            orionPainelConfiguracoes.contains(
                event.target
            )
        ) {

            return;
        }


        if (
            event.target ===
            orionBtnAbrirConfiguracoes
        ) {

            return;
        }


        orionPainelConfiguracoes.classList.remove(
            "aberto"
        );
    }
);


// ============================================================
// TEMA
// ============================================================

if (
    orionConfigTema
) {

    orionConfigTema.addEventListener(
        "change",
        function () {

            orionAtualizarConfiguracao(
                "tema",
                orionConfigTema.value
            );
        }
    );
}


// ============================================================
// SOM
// ============================================================

if (
    orionConfigSom
) {

    orionConfigSom.addEventListener(
        "change",
        function () {

            orionAtualizarConfiguracao(
                "som",
                orionConfigSom.checked
            );


            if (
                orionVozChat
            ) {

                orionVozChat.checked =
                    orionConfigSom.checked;
            }


            if (
                !orionConfigSom.checked &&
                "speechSynthesis" in window
            ) {

                window.speechSynthesis.cancel();
            }
        }
    );
}


// ============================================================
// VOZ NO PAINEL
// ============================================================

if (
    orionConfigVoz
) {

    orionConfigVoz.addEventListener(
        "change",
        function () {

            orionAtualizarConfiguracao(
                "voz",
                orionConfigVoz.value
            );


            orionAplicarVozConfigurada();

        }
    );
}


// ============================================================
// ANIMAÇÕES
// ============================================================

if (
    orionConfigAnimacoes
) {

    orionConfigAnimacoes.addEventListener(
        "change",
        function () {

            orionAtualizarConfiguracao(
                "animacoes",
                orionConfigAnimacoes.checked
            );
        }
    );
}


// ============================================================
// ENTER
// ============================================================

if (
    orionConfigEnter
) {

    orionConfigEnter.addEventListener(
        "change",
        function () {

            orionAtualizarConfiguracao(
                "enterEnviar",
                orionConfigEnter.checked
            );
        }
    );
}


// ============================================================
// CONFIGURAÇÕES DE CONTA
// ============================================================

if (
    orionBtnConfiguracoesConta
) {

    orionBtnConfiguracoesConta.addEventListener(
        "click",
        function () {

            window.location.href =
                "/perfil";
        }
    );
}


// ============================================================
// HISTÓRICO ATUAL
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
                    method:
                        "GET",

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


        if (
            !resposta.ok
        ) {

            console.warn(
                "Erro ao carregar histórico:",
                resposta.status
            );

            atualizarWelcome();

            return;
        }


        const historico =
            await resposta.json();


        chat.innerHTML =
            "";


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
// LISTAR CONVERSAS
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
                    method:
                        "GET",

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


        if (
            !resposta.ok
        ) {

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


        container.innerHTML =
            "";


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

            if (
                modoSelecao
            ) {

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

async function abrirConversa(
    id
) {

    if (
        modoSelecao
    ) {

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
                    method:
                        "GET",

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


        if (
            !resposta.ok
        ) {

            alert(
                dados.message ||
                "❌ Não foi possível abrir a conversa."
            );

            return;
        }


        window.conversationId =
            id;


        if (chat) {

            chat.innerHTML =
                "";
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
                        ) ===
                        String(id)
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
                    method:
                        "POST",

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
                    method:
                        "POST",

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

                chat.innerHTML =
                    "";
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
// SELECIONAR CONVERSA
// ============================================================

function alternarSelecaoConversa(
    id,
    item
) {

    if (
        !modoSelecao
    ) {

        entrarModoSelecao();
    }


    item.classList.toggle(
        "selecionada"
    );


    atualizarSelecaoVisual();
}


// ============================================================
// VISUAL DA SELEÇÃO
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


            if (
                modoSelecao
            ) {

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


    if (
        !ids.length
    ) {

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
                    method:
                        "POST",

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

                chat.innerHTML =
                    "";
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
// DUPLO CLIQUE
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
// INICIALIZAÇÃO
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        orionAplicarConfiguracoes();

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

window.orionObterConfiguracoes =
    orionObterConfiguracoes;

window.orionSalvarConfiguracoes =
    orionSalvarConfiguracoes;

