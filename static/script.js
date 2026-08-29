
// ============================================================
// ORION AI - SCRIPT.JS
// ============================================================

let enviando = false;
let vozesDisponiveis = [];
let arquivoAtual = null;


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
// LIMPAR ASPAS TRIPLAS
// ============================================================

function limparAspasTriplas(texto) {

    if (!texto) {
        return "";
    }

    let resultado = String(texto);

    resultado = resultado.replace(/^\s*'''(?:\w+)?\s*/, "");
    resultado = resultado.replace(/\s*'''\s*$/, "");
    resultado = resultado.replace(/^\s*'''\s*$/gm, "");

    return resultado.trim();
}


// ============================================================
// FORMATAR RESPOSTA
// ============================================================

function formatarResposta(texto) {

    if (!texto) {
        return "";
    }

    texto = limparAspasTriplas(texto);

    let protegido = escaparHTML(texto);

    const blocosCodigo = [];

    protegido = protegido.replace(
        /```([a-zA-Z0-9_+#.-]*)\s*\n?([\s\S]*?)```/g,
        function (_, linguagem, codigo) {

            const id = blocosCodigo.length;

            const codigoSeguro = codigo
                .trim()
                .replace(/^\s*'''/g, "")
                .replace(/'''\s*$/g, "")
                .trim();

            blocosCodigo.push(
                `<pre class="codigo-pedrogpt"><code>${codigoSeguro}</code></pre>`
            );

            return `___CODIGO_${id}___`;
        }
    );

    protegido = protegido.replace(
        /^\s*'''\s*$/gm,
        ""
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

    linhas.forEach(function (linha) {

        const trim = linha.trim();

        if (trim === "'''") {
            return;
        }

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

    blocosCodigo.forEach(function (codigo, index) {

        resultado = resultado.replace(
            `___CODIGO_${index}___`,
            codigo
        );

    });

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
        chat.scrollTop = chat.scrollHeight;
    });
}


// ============================================================
// COPIAR MENSAGEM
// ============================================================

async function copiarMensagem(texto, botao) {

    try {

        await navigator.clipboard.writeText(texto);

        const textoOriginal =
            botao.textContent;

        botao.textContent =
            "✅ Copiado!";

        botao.disabled = true;

        setTimeout(function () {

            botao.textContent =
                textoOriginal;

            botao.disabled = false;

        }, 1500);

    } catch (erro) {

        console.error(
            "Erro ao copiar mensagem:",
            erro
        );

        try {

            const area =
                document.createElement("textarea");

            area.value = texto;

            area.style.position = "fixed";
            area.style.opacity = "0";

            document.body.appendChild(area);

            area.focus();
            area.select();

            document.execCommand("copy");

            document.body.removeChild(area);

            const textoOriginal =
                botao.textContent;

            botao.textContent =
                "✅ Copiado!";

            botao.disabled = true;

            setTimeout(function () {

                botao.textContent =
                    textoOriginal;

                botao.disabled = false;

            }, 1500);

        } catch (fallbackErro) {

            console.error(
                "Não foi possível copiar:",
                fallbackErro
            );

            alert(
                "Não foi possível copiar a mensagem."
            );
        }
    }
}


// ============================================================
// SISTEMA DE VOZ
// ============================================================

function carregarVozes() {

    if (!("speechSynthesis" in window)) {
        return;
    }

    const seletor =
        elemento("seletorVoz");

    if (!seletor) {
        return;
    }

    const vozes =
        speechSynthesis.getVoices();

    if (!vozes || vozes.length === 0) {
        return;
    }

    vozesDisponiveis = vozes;

    const vozSalva =
        localStorage.getItem("orion_voz");

    seletor.innerHTML = "";

    const ordenadas =
        [...vozes].sort(function (a, b) {

            const aPT =
                a.lang.toLowerCase().startsWith("pt");

            const bPT =
                b.lang.toLowerCase().startsWith("pt");

            if (aPT && !bPT) {
                return -1;
            }

            if (!aPT && bPT) {
                return 1;
            }

            return a.name.localeCompare(b.name);
        });

    ordenadas.forEach(function (voz) {

        const option =
            document.createElement("option");

        option.value =
            vozes.indexOf(voz);

        option.textContent =
            `${voz.name} (${voz.lang})`;

        seletor.appendChild(option);

        if (
            vozSalva &&
            voz.name === vozSalva
        ) {

            option.selected = true;
        }
    });

    if (!vozSalva) {

        const vozBrasileira =
            ordenadas.find(function (voz) {

                return voz.lang
                    .toLowerCase()
                    .includes("pt-br");

            });

        if (vozBrasileira) {

            seletor.value =
                vozes.indexOf(vozBrasileira);

        } else {

            const vozPortugues =
                ordenadas.find(function (voz) {

                    return voz.lang
                        .toLowerCase()
                        .startsWith("pt");

                });

            if (vozPortugues) {

                seletor.value =
                    vozes.indexOf(vozPortugues);
            }
        }
    }
}


function obterVozSelecionada() {

    if (!vozesDisponiveis.length) {
        return null;
    }

    const seletor =
        elemento("seletorVoz");

    if (!seletor) {
        return null;
    }

    const indice =
        Number(seletor.value);

    return vozesDisponiveis[indice] || null;
}


function salvarVozSelecionada() {

    const seletor =
        elemento("seletorVoz");

    if (!seletor) {
        return;
    }

    const voz =
        obterVozSelecionada();

    if (!voz) {
        return;
    }

    localStorage.setItem(
        "orion_voz",
        voz.name
    );
}


function testarVoz() {

    if (!("speechSynthesis" in window)) {

        alert(
            "Seu navegador não suporta reprodução de voz."
        );

        return;
    }

    const voz =
        obterVozSelecionada();

    speechSynthesis.cancel();

    const fala =
        new SpeechSynthesisUtterance(
            "Olá! Eu sou a Orion AI. Essa é a voz selecionada."
        );

    fala.lang =
        voz?.lang || "pt-BR";

    fala.rate = 1;
    fala.pitch = 1;

    if (voz) {
        fala.voice = voz;
    }

    speechSynthesis.speak(fala);
}


function falarResposta(texto) {

    const opcaoVoz =
        elemento("voz");

    if (
        !opcaoVoz ||
        !opcaoVoz.checked
    ) {
        return;
    }

    if (!("speechSynthesis" in window)) {
        return;
    }

    speechSynthesis.cancel();

    const vozSelecionada =
        obterVozSelecionada();

    const fala =
        new SpeechSynthesisUtterance(texto);

    fala.lang =
        vozSelecionada?.lang ||
        "pt-BR";

    fala.rate = 1;
    fala.pitch = 1;

    if (vozSelecionada) {
        fala.voice = vozSelecionada;
    }

    speechSynthesis.speak(fala);
}


// ============================================================
// ADICIONAR MENSAGEM
// ============================================================

function addMensagem(texto, tipo, imagem = null) {

    const chat =
        elemento("chat");

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

    let conteudo = "";

    if (imagem) {

        conteudo += `
            <img
                src="${imagem}"
                style="
                    display:block;
                    max-width:280px;
                    max-height:300px;
                    width:auto;
                    height:auto;
                    border-radius:12px;
                    margin-bottom:8px;
                    object-fit:contain;
                    cursor:pointer;
                "
                alt="Imagem enviada"
                onclick="abrirImagem(this.src)"
            >
        `;
    }

    if (ehUsuario) {

        if (texto) {

            conteudo +=
                escaparHTML(texto)
                    .replace(/\n/g, "<br>");
        }

    } else {

        conteudo +=
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

        ${
            !ehUsuario
            ? `
                <button
                    type="button"
                    class="copiar-mensagem"
                    style="
                        margin-top:8px;
                        padding:5px 9px;
                        border-radius:8px;
                        border:1px solid rgba(255,255,255,0.1);
                        background:rgba(255,255,255,0.06);
                        color:white;
                        cursor:pointer;
                        font-size:11px;
                    "
                >
                    📋 Copiar
                </button>
            `
            : ""
        }
    `;

    // ========================================================
    // COPIAR
    // ========================================================

    if (!ehUsuario) {

        const botaoCopiar =
            div.querySelector(
                ".copiar-mensagem"
            );

        if (botaoCopiar) {

            botaoCopiar.addEventListener(
                "click",
                function () {

                    copiarMensagem(
                        limparAspasTriplas(texto),
                        botaoCopiar
                    );

                }
            );
        }
    }

    chat.appendChild(div);

    scrollBottom();

    return div;
}


// ============================================================
// ABRIR IMAGEM
// ============================================================

function abrirImagem(src) {

    if (!src) {
        return;
    }

    const fundo =
        document.createElement("div");

    fundo.style.position = "fixed";
    fundo.style.inset = "0";
    fundo.style.background = "rgba(0,0,0,0.85)";
    fundo.style.display = "flex";
    fundo.style.alignItems = "center";
    fundo.style.justifyContent = "center";
    fundo.style.zIndex = "99999";
    fundo.style.padding = "20px";
    fundo.style.cursor = "zoom-out";

    const imagem =
        document.createElement("img");

    imagem.src = src;

    imagem.style.maxWidth = "95%";
    imagem.style.maxHeight = "95%";
    imagem.style.objectFit = "contain";
    imagem.style.borderRadius = "12px";

    fundo.appendChild(imagem);

    fundo.addEventListener(
        "click",
        function () {
            fundo.remove();
        }
    );

    document.body.appendChild(fundo);
}


// ============================================================
// ARQUIVOS
// ============================================================

function configurarArquivos() {

    const btnArquivo =
        elemento("btnArquivo");

    const arquivo =
        elemento("arquivo");

    const arquivoSelecionado =
        elemento("arquivoSelecionado");

    const nomeArquivo =
        elemento("nomeArquivo");

    const removerArquivo =
        elemento("removerArquivo");

    if (!btnArquivo || !arquivo) {

        console.warn(
            "Botão ou input de arquivo não encontrado."
        );

        return;
    }

    // ========================================================
    // ABRIR SELETOR
    // ========================================================

    btnArquivo.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            arquivo.click();
        }
    );

    // ========================================================
    // ARQUIVO ESCOLHIDO
    // ========================================================

    arquivo.addEventListener(
        "change",
        function () {

            if (
                !arquivo.files ||
                arquivo.files.length === 0
            ) {
                return;
            }

            const escolhido =
                arquivo.files[0];

            arquivoAtual =
                escolhido;

            if (nomeArquivo) {

                nomeArquivo.textContent =
                    escolhido.name;
            }

            if (arquivoSelecionado) {

                arquivoSelecionado.classList.add(
                    "ativo"
                );
            }

            // =================================================
            // MOSTRAR PREVIEW
            // =================================================

            let preview =
                elemento("previewArquivo");

            if (!preview) {

                preview =
                    document.createElement("img");

                preview.id =
                    "previewArquivo";

                preview.style.width =
                    "55px";

                preview.style.height =
                    "55px";

                preview.style.objectFit =
                    "cover";

                preview.style.borderRadius =
                    "8px";

                preview.style.border =
                    "1px solid rgba(255,255,255,0.1)";

                preview.style.flexShrink =
                    "0";

                if (nomeArquivo) {

                    arquivoSelecionado.insertBefore(
                        preview,
                        nomeArquivo
                    );
                }
            }

            // =================================================
            // SE FOR IMAGEM
            // =================================================

            if (
                escolhido.type &&
                escolhido.type.startsWith("image/")
            ) {

                preview.style.display =
                    "block";

                const leitor =
                    new FileReader();

                leitor.onload =
                    function (evento) {

                        preview.src =
                            evento.target.result;
                    };

                leitor.readAsDataURL(
                    escolhido
                );

            } else {

                preview.removeAttribute("src");

                preview.style.display =
                    "none";
            }

            esconderWelcome();

            scrollBottom();
        }
    );

    // ========================================================
    // REMOVER ARQUIVO
    // ========================================================

    if (removerArquivo) {

        removerArquivo.addEventListener(
            "click",
            function () {

                arquivo.value = "";

                arquivoAtual =
                    null;

                if (nomeArquivo) {

                    nomeArquivo.textContent =
                        "Nenhum arquivo selecionado";
                }

                if (arquivoSelecionado) {

                    arquivoSelecionado.classList.remove(
                        "ativo"
                    );
                }

                const preview =
                    elemento("previewArquivo");

                if (preview) {
                    preview.remove();
                }
            }
        );
    }
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
                    cache: "no-store",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (resposta.status === 401) {
            return;
        }

        if (!resposta.ok) {
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

            addMensagem(
                item?.message ?? "",
                item?.sender === "user"
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

    // ========================================================
    // PERMITE ENVIAR FOTO SEM TEXTO
    // ========================================================

    if (!texto && !arquivoAtual) {

        campo.focus();

        return;
    }

    enviando = true;

    esconderWelcome();

    // ========================================================
    // PREPARAR IMAGEM PARA EXIBIR
    // ========================================================

    let imagemPreview =
        null;

    if (
        arquivoAtual &&
        arquivoAtual.type &&
        arquivoAtual.type.startsWith("image/")
    ) {

        imagemPreview =
            await arquivoParaDataURL(
                arquivoAtual
            );
    }

    // ========================================================
    // MOSTRAR MENSAGEM DO USUÁRIO
    // ========================================================

    addMensagem(
        texto,
        "user",
        imagemPreview
    );

    campo.value = "";

    // ========================================================
    // LIMPAR ARQUIVO DA INTERFACE
    // ========================================================

    limparArquivoSelecionado();

    // ========================================================
    // BOTÃO
    // ========================================================

    if (botao) {

        botao.disabled = true;

        botao.textContent =
            "Enviando...";
    }

    const typing =
        addMensagem(
            "",
            "bot typing"
        );

    try {

        // ====================================================
        // MANTÉM O ENVIO ORIGINAL DO CHAT
        // ====================================================

        const resposta =
            await fetch(
                "/chat",
                {
                    method: "POST",

                    credentials:
                        "same-origin",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Accept":
                            "application/json"
                    },

                    body: JSON.stringify({
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
                "Erro ao interpretar JSON:",
                erroJSON
            );
        }

        if (!resposta.ok) {

            let mensagemErro =
                "Erro ao conectar com o servidor.";

            if (data.reply) {
                mensagemErro = data.reply;
            } else if (data.message) {
                mensagemErro = data.message;
            } else if (data.error) {
                mensagemErro = data.error;
            }

            addMensagem(
                mensagemErro,
                "bot"
            );

            return;
        }

        const textoResposta =
            limparAspasTriplas(
                data.reply ||
                data.response ||
                "Não recebi uma resposta da IA."
            );

        addMensagem(
            textoResposta,
            "bot"
        );

        falarResposta(
            textoResposta
        );

        await carregarConversas();

    } catch (erro) {

        console.error(
            "Erro no envio:",
            erro
        );

        if (typing) {
            typing.remove();
        }

        addMensagem(
            "❌ Erro ao conectar com o servidor. Verifique se o servidor está funcionando.",
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
// CONVERTER ARQUIVO PARA DATA URL
// ============================================================

function arquivoParaDataURL(arquivo) {

    return new Promise(function (resolve, reject) {

        const leitor =
            new FileReader();

        leitor.onload =
            function (evento) {

                resolve(
                    evento.target.result
                );
            };

        leitor.onerror =
            function (erro) {

                reject(erro);
            };

        leitor.readAsDataURL(
            arquivo
        );
    });
}


// ============================================================
// LIMPAR ARQUIVO
// ============================================================

function limparArquivoSelecionado() {

    const arquivo =
        elemento("arquivo");

    const arquivoSelecionado =
        elemento("arquivoSelecionado");

    const nomeArquivo =
        elemento("nomeArquivo");

    const preview =
        elemento("previewArquivo");

    if (arquivo) {
        arquivo.value = "";
    }

    arquivoAtual =
        null;

    if (nomeArquivo) {

        nomeArquivo.textContent =
            "Nenhum arquivo selecionado";
    }

    if (arquivoSelecionado) {

        arquivoSelecionado.classList.remove(
            "ativo"
        );
    }

    if (preview) {
        preview.remove();
    }
}


// ============================================================
// ATALHO
// ============================================================

function atalho(texto) {

    esconderWelcome();

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
                "Erro JSON:",
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

        limparArquivoSelecionado();

        if ("speechSynthesis" in window) {
            speechSynthesis.cancel();
        }

        const titulo =
            elemento("tituloConversa");

        if (titulo) {
            titulo.textContent =
                "Orion AI";
        }

        await carregarConversas();

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
// CARREGAR CONVERSAS
// ============================================================

async function carregarConversas() {

    const lista =
        elemento("conversas");

    if (!lista) {
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

                    cache:
                        "no-store",

                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        if (resposta.status === 401) {
            return;
        }

        if (!resposta.ok) {
            return;
        }

        const conversas =
            await resposta.json();

        lista.innerHTML = "";

        if (
            !Array.isArray(conversas) ||
            conversas.length === 0
        ) {
            return;
        }

        const conversaAtual =
            await obterConversaAtual();

        conversas.forEach(
            function (conversa) {

                const item =
                    document.createElement("button");

                item.type =
                    "button";

                item.className =
                    "conversa-item";

                item.dataset.id =
                    conversa.id;

                item.textContent =
                    conversa.title ||
                    "Nova conversa";

                if (
                    String(conversa.id) ===
                    String(conversaAtual)
                ) {

                    item.classList.add(
                        "ativa"
                    );
                }

                item.addEventListener(
                    "click",
                    function () {

                        abrirConversa(
                            conversa.id
                        );
                    }
                );

                lista.appendChild(item);
            }
        );

    } catch (erro) {

        console.error(
            "Erro ao carregar conversas:",
            erro
        );
    }
}


// ============================================================
// OBTER CONVERSA ATUAL
// ============================================================

async function obterConversaAtual() {

    try {

        const resposta =
            await fetch(
                "/api/status",
                {
                    method: "GET",

                    credentials:
                        "same-origin",

                    cache:
                        "no-store"
                }
            );

        if (!resposta.ok) {
            return null;
        }

        const data =
            await resposta.json();

        return data.conversation_id ?? null;

    } catch (erro) {

        console.error(
            "Erro ao obter conversa atual:",
            erro
        );

        return null;
    }
}


// ============================================================
// ABRIR CONVERSA
// ============================================================

async function abrirConversa(id) {

    if (enviando) {
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

                    cache:
                        "no-store",

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
                "Erro JSON:",
                erroJSON
            );
        }

        if (
            !resposta.ok ||
            !data.success
        ) {

            alert(
                data.message ||
                "Não foi possível abrir a conversa."
            );

            return;
        }

        const chat =
            elemento("chat");

        if (!chat) {
            return;
        }

        chat.innerHTML = "";

        const titulo =
            elemento("tituloConversa");

        if (titulo) {

            titulo.textContent =
                data.title ||
                "Orion AI";
        }

        const mensagens =
            data.messages || [];

        if (
            mensagens.length === 0
        ) {

            mostrarWelcome();

        } else {

            esconderWelcome();

            mensagens.forEach(
                function (item) {

                    addMensagem(
                        item.message,
                        item.sender === "user"
                            ? "user"
                            : "bot"
                    );

                }
            );
        }

        document
            .querySelectorAll(
                ".conversa-item"
            )
            .forEach(
                function (item) {

                    item.classList.toggle(
                        "ativa",
                        String(item.dataset.id) ===
                        String(id)
                    );

                }
            );

        scrollBottom();

    } catch (erro) {

        console.error(
            "Erro ao abrir conversa:",
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
// CONFIGURAR VOZ
// ============================================================

function configurarVoz() {

    const opcaoVoz =
        elemento("voz");

    if (opcaoVoz) {

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

    const seletor =
        elemento("seletorVoz");

    if (seletor) {

        seletor.addEventListener(
            "change",
            function () {

                salvarVozSelecionada();

                if (
                    "speechSynthesis" in window
                ) {

                    speechSynthesis.cancel();
                }

            }
        );
    }

    const botaoTestar =
        elemento("btnTestarVoz");

    if (botaoTestar) {

        botaoTestar.addEventListener(
            "click",
            testarVoz
        );
    }

    carregarVozes();

    if (
        "speechSynthesis" in window
    ) {

        speechSynthesis.onvoiceschanged =
            function () {

                carregarVozes();

            };
    }
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
            "Orion AI: script carregado corretamente."
        );

        configurarEnter();

        configurarVoz();

        configurarFormulario();

        configurarArquivos();

        await carregarHistorico();

        await carregarConversas();

        const campo =
            elemento("mensagem");

        if (campo) {
            campo.focus();
        }

    }
);

