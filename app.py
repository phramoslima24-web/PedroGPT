import os
import secrets
import re
import time

from datetime import datetime, timedelta

import requests
import psycopg2
import psycopg2.extras

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    session,
    redirect,
    url_for,
    Response,
    stream_with_context
)

from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)

from groq import Groq

from authlib.integrations.flask_client import OAuth


# ============================================================
# ORION AI - APP.PY
# ============================================================

app = Flask(__name__)


# ============================================================
# CONFIGURAÇÕES
# ============================================================

app.secret_key = os.getenv(
    "FLASK_SECRET_KEY",
    "orion_ai_secret_key"
)

GROQ_API_KEY = os.getenv(
    "GROQ_API_KEY"
)

DATABASE_URL = os.getenv(
    "DATABASE_URL"
)


# ============================================================
# ADMIN
# ============================================================

ADMIN_USERNAME = os.getenv(
    "ADMIN_USERNAME",
    "admin"
).strip()

ADMIN_PASSWORD = os.getenv(
    "ADMIN_PASSWORD",
    ""
)


# ============================================================
# GOOGLE
# ============================================================

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    ""
).strip()

GOOGLE_CLIENT_SECRET = os.getenv(
    "GOOGLE_CLIENT_SECRET",
    ""
).strip()


# ============================================================
# RESEND / RECUPERAÇÃO DE CONTA
# ============================================================

RESEND_API_KEY = os.getenv(
    "RESEND_API_KEY",
    ""
).strip()

RESEND_FROM = os.getenv(
    "RESEND_FROM",
    ""
).strip()

RESET_TOKEN_EXPIRATION_MINUTES = 30


# ============================================================
# PROTEÇÃO CONTRA TENTATIVAS DE LOGIN
# ============================================================

LOGIN_FAILURE_WINDOW_MINUTES = 15

LOGIN_LOCKOUT_MINUTES = 10

LOGIN_MAX_FAILURES_USER = 5

LOGIN_MAX_FAILURES_IP = 10


# ============================================================
# GROQ
# ============================================================

client = None

if GROQ_API_KEY:

    client = Groq(
        api_key=GROQ_API_KEY
    )


# ============================================================
# GOOGLE OAUTH
# ============================================================

oauth = OAuth(app)

google = None

if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:

    google = oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url=(
            "https://accounts.google.com/"
            ".well-known/openid-configuration"
        ),
        client_kwargs={
            "scope": "openid email profile"
        }
    )


# ============================================================
# BANCO DE DADOS
# ============================================================

def get_db():

    if not DATABASE_URL:

        raise RuntimeError(
            "DATABASE_URL não está configurada no servidor."
        )

    return psycopg2.connect(
        DATABASE_URL,
        connect_timeout=10
    )


# ============================================================
# INICIALIZAR BANCO
# ============================================================

def init_db():

    with get_db() as conn:

        cursor = conn.cursor()

        # ----------------------------------------------------
        # USERS
        # ----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                plan TEXT DEFAULT 'free',
                auth_version INTEGER DEFAULT 1,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free'
        """)

        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS google_id TEXT
        """)

        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email TEXT
        """)

        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS auth_version INTEGER DEFAULT 1
        """)

        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP
        """)

        cursor.execute("""
            UPDATE users
            SET auth_version = 1
            WHERE auth_version IS NULL
        """)

        cursor.execute("""
            UPDATE users
            SET last_activity = CURRENT_TIMESTAMP
            WHERE last_activity IS NULL
        """)

        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS
            users_google_id_unique
            ON users (google_id)
            WHERE google_id IS NOT NULL
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            users_email_index
            ON users (LOWER(email))
        """)

        # ----------------------------------------------------
        # MESSAGES
        # ----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                username TEXT,
                sender TEXT,
                message TEXT
            )
        """)

        # ----------------------------------------------------
        # CONVERSATIONS
        # ----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                title TEXT DEFAULT 'Nova conversa',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ----------------------------------------------------
        # CHAT MESSAGES
        # ----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER NOT NULL,
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (conversation_id)
                REFERENCES conversations(id)
                ON DELETE CASCADE
            )
        """)

        # ----------------------------------------------------
        # TOKENS DE RECUPERAÇÃO
        # ----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                token_hash TEXT UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            password_reset_user_index
            ON password_reset_tokens (user_id)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            password_reset_expiration_index
            ON password_reset_tokens (expires_at)
        """)

        # ----------------------------------------------------
        # HISTÓRICO DE ACESSOS
        # ----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS access_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                username TEXT NOT NULL,
                login_method TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            access_logs_user_index
            ON access_logs (user_id)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            access_logs_created_index
            ON access_logs (created_at DESC)
        """)

        # ----------------------------------------------------
        # PROTEÇÃO DE LOGIN
        # ----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS login_attempts (
                id SERIAL PRIMARY KEY,
                identifier_type TEXT NOT NULL,
                identifier TEXT NOT NULL,
                failed_attempts INTEGER DEFAULT 0,
                first_failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                blocked_until TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS
            login_attempts_identifier_unique
            ON login_attempts (
                identifier_type,
                identifier
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            login_attempts_blocked_index
            ON login_attempts (blocked_until)
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS
            login_attempts_last_failed_index
            ON login_attempts (last_failed_at)
        """)

        conn.commit()


try:

    init_db()

    print(
        "BANCO DE DADOS INICIALIZADO COM SUCESSO."
    )

except Exception as e:

    print(
        "ERRO AO INICIALIZAR BANCO:",
        repr(e)
    )


# ============================================================
# PROTEÇÃO CONTRA BRUTE FORCE
# ============================================================

def obter_ip_cliente():

    try:

        forwarded_for = request.headers.get(
            "X-Forwarded-For",
            ""
        )

        if forwarded_for:

            ip = (
                forwarded_for
                .split(",")[0]
                .strip()
            )

            if ip:

                return str(ip)[:100]

        ip = (
            request.remote_addr
            or "desconhecido"
        )

        return str(ip)[:100]

    except Exception:

        return "desconhecido"


def normalizar_identificador_login(
    identifier_type,
    identifier
):

    tipo = str(
        identifier_type or ""
    ).strip().lower()

    valor = str(
        identifier or ""
    ).strip()

    if tipo == "username":

        valor = valor.lower()

    return valor[:255]


def limpar_tentativa_expirada(
    identifier_type,
    identifier
):

    identifier_type = (
        normalizar_identificador_login(
            identifier_type,
            identifier
        )
    )

    # A função acima retorna somente o valor.
    # Recriamos os valores normalizados.

    tipo = str(
        identifier_type or ""
    ).strip()

    valor = str(
        identifier or ""
    ).strip()

    if not valor:

        return

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                DELETE FROM login_attempts
                WHERE last_failed_at <
                    CURRENT_TIMESTAMP
                    - (%s * INTERVAL '1 minute')
            """, (
                LOGIN_FAILURE_WINDOW_MINUTES,
            ))

            conn.commit()

    except Exception as e:

        print(
            "ERRO AO LIMPAR TENTATIVAS EXPIRADAS:",
            repr(e)
        )


def verificar_bloqueio_login(
    identifier_type,
    identifier
):

    tipo = str(
        identifier_type or ""
    ).strip().lower()

    valor = str(
        identifier or ""
    ).strip()

    if not valor:

        return {

            "blocked":
                False,

            "seconds":
                0

        }

    if tipo == "username":

        valor = valor.lower()

    valor = valor[:255]

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    failed_attempts,
                    first_failed_at,
                    last_failed_at,
                    blocked_until
                FROM login_attempts
                WHERE identifier_type = %s
                AND identifier = %s
            """, (
                tipo,
                valor
            ))

            registro = cursor.fetchone()

            if not registro:

                return {

                    "blocked":
                        False,

                    "seconds":
                        0

                }

            agora = datetime.utcnow()

            blocked_until = (
                registro["blocked_until"]
            )

            if blocked_until:

                if blocked_until > agora:

                    segundos = int(
                        (
                            blocked_until
                            - agora
                        ).total_seconds()
                    )

                    return {

                        "blocked":
                            True,

                        "seconds":
                            max(
                                1,
                                segundos
                            )

                    }

                cursor.execute("""
                    DELETE FROM login_attempts
                    WHERE identifier_type = %s
                    AND identifier = %s
                """, (
                    tipo,
                    valor
                ))

                conn.commit()

                return {

                    "blocked":
                        False,

                    "seconds":
                        0

                }

            primeira_tentativa = (
                registro["first_failed_at"]
            )

            if primeira_tentativa:

                limite_janela = (
                    agora
                    - timedelta(
                        minutes=
                            LOGIN_FAILURE_WINDOW_MINUTES
                    )
                )

                if primeira_tentativa < limite_janela:

                    cursor.execute("""
                        DELETE FROM login_attempts
                        WHERE identifier_type = %s
                        AND identifier = %s
                    """, (
                        tipo,
                        valor
                    ))

                    conn.commit()

                    return {

                        "blocked":
                            False,

                        "seconds":
                            0

                    }

            return {

                "blocked":
                    False,

                "seconds":
                    0

            }

    except Exception as e:

        print(
            "ERRO AO VERIFICAR BLOQUEIO:",
            repr(e)
        )

        # Em caso de erro no mecanismo de proteção,
        # não impede usuários legítimos de entrarem.

        return {

            "blocked":
                False,

            "seconds":
                0

        }


def registrar_falha_login(
    identifier_type,
    identifier,
    max_failures
):

    tipo = str(
        identifier_type or ""
    ).strip().lower()

    valor = str(
        identifier or ""
    ).strip()

    if not valor:

        return {

            "blocked":
                False,

            "seconds":
                0,

            "attempts":
                0

        }

    if tipo == "username":

        valor = valor.lower()

    valor = valor[:255]

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    failed_attempts,
                    first_failed_at,
                    last_failed_at,
                    blocked_until
                FROM login_attempts
                WHERE identifier_type = %s
                AND identifier = %s
                FOR UPDATE
            """, (
                tipo,
                valor
            ))

            registro = cursor.fetchone()

            agora = datetime.utcnow()

            if not registro:

                tentativas = 1

                cursor.execute("""
                    INSERT INTO login_attempts
                    (
                        identifier_type,
                        identifier,
                        failed_attempts,
                        first_failed_at,
                        last_failed_at,
                        blocked_until
                    )
                    VALUES
                    (%s, %s, %s, %s, %s, NULL)
                """, (
                    tipo,
                    valor,
                    tentativas,
                    agora,
                    agora
                ))

            else:

                primeira_tentativa = (
                    registro["first_failed_at"]
                )

                if (
                    primeira_tentativa is None
                    or primeira_tentativa
                    <
                    (
                        agora
                        - timedelta(
                            minutes=
                                LOGIN_FAILURE_WINDOW_MINUTES
                        )
                    )
                ):

                    tentativas = 1

                    cursor.execute("""
                        UPDATE login_attempts
                        SET failed_attempts = %s,
                            first_failed_at = %s,
                            last_failed_at = %s,
                            blocked_until = NULL
                        WHERE id = %s
                    """, (
                        tentativas,
                        agora,
                        agora,
                        registro["id"]
                    ))

                else:

                    tentativas = (
                        int(
                            registro["failed_attempts"]
                            or 0
                        )
                        + 1
                    )

                    bloqueado_ate = None

                    if tentativas >= max_failures:

                        bloqueado_ate = (
                            agora
                            + timedelta(
                                minutes=
                                    LOGIN_LOCKOUT_MINUTES
                            )
                        )

                    cursor.execute("""
                        UPDATE login_attempts
                        SET failed_attempts = %s,
                            last_failed_at = %s,
                            blocked_until = %s
                        WHERE id = %s
                    """, (
                        tentativas,
                        agora,
                        bloqueado_ate,
                        registro["id"]
                    ))

            bloqueado = (
                tentativas >= max_failures
            )

            segundos = (
                LOGIN_LOCKOUT_MINUTES
                * 60
                if bloqueado
                else 0
            )

            conn.commit()

            return {

                "blocked":
                    bloqueado,

                "seconds":
                    segundos,

                "attempts":
                    tentativas

            }

    except Exception as e:

        print(
            "ERRO AO REGISTRAR FALHA DE LOGIN:",
            repr(e)
        )

        return {

            "blocked":
                False,

            "seconds":
                0,

            "attempts":
                0

        }


def limpar_falhas_login(
    identifier_type,
    identifier
):

    tipo = str(
        identifier_type or ""
    ).strip().lower()

    valor = str(
        identifier or ""
    ).strip()

    if not valor:

        return

    if tipo == "username":

        valor = valor.lower()

    valor = valor[:255]

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                DELETE FROM login_attempts
                WHERE identifier_type = %s
                AND identifier = %s
            """, (
                tipo,
                valor
            ))

            conn.commit()

    except Exception as e:

        print(
            "ERRO AO LIMPAR FALHAS DE LOGIN:",
            repr(e)
        )


def formatar_tempo_bloqueio(
    segundos
):

    segundos = max(
        1,
        int(segundos or 0)
    )

    minutos = (
        segundos + 59
    ) // 60

    if minutos <= 1:

        return "aproximadamente 1 minuto"

    return (
        f"aproximadamente {minutos} minutos"
    )


def verificar_protecao_login(
    username
):

    ip = obter_ip_cliente()

    bloqueio_ip = (
        verificar_bloqueio_login(
            "ip",
            ip
        )
    )

    if bloqueio_ip["blocked"]:

        return {

            "blocked":
                True,

            "message":
                (
                    "Muitas tentativas de login "
                    "foram detectadas neste endereço. "
                    "Tente novamente em "
                    +
                    formatar_tempo_bloqueio(
                        bloqueio_ip["seconds"]
                    )
                    +
                    "."
                ),

            "retry_after":
                bloqueio_ip["seconds"]

        }

    if username:

        bloqueio_usuario = (
            verificar_bloqueio_login(
                "username",
                username
            )
        )

        if bloqueio_usuario["blocked"]:

            return {

                "blocked":
                    True,

                "message":
                    (
                        "Esta conta foi temporariamente "
                        "bloqueada após várias tentativas "
                        "de login. Tente novamente em "
                        +
                        formatar_tempo_bloqueio(
                            bloqueio_usuario["seconds"]
                        )
                        +
                        "."
                    ),

                "retry_after":
                    bloqueio_usuario["seconds"]

            }

    return {

        "blocked":
            False,

        "message":
            "",

        "retry_after":
            0

    }


def registrar_falha_login_completa(
    username
):

    ip = obter_ip_cliente()

    resultado_ip = (
        registrar_falha_login(
            "ip",
            ip,
            LOGIN_MAX_FAILURES_IP
        )
    )

    resultado_usuario = {

        "blocked":
            False,

        "seconds":
            0,

        "attempts":
            0

    }

    if username:

        resultado_usuario = (
            registrar_falha_login(
                "username",
                username,
                LOGIN_MAX_FAILURES_USER
            )
        )

    if (
        resultado_ip["blocked"]
        or resultado_usuario["blocked"]
    ):

        segundos = max(
            resultado_ip["seconds"],
            resultado_usuario["seconds"]
        )

        return {

            "blocked":
                True,

            "seconds":
                segundos

        }

    return {

        "blocked":
            False,

        "seconds":
            0

    }


def limpar_falhas_login_completa(
    username
):

    ip = obter_ip_cliente()

    limpar_falhas_login(
        "ip",
        ip
    )

    if username:

        limpar_falhas_login(
            "username",
            username
        )


# ============================================================
# CONTROLE DE SESSÃO
# ============================================================

def validar_sessao_usuario():

    if "user" not in session:

        return True

    if session.get("admin") is True:

        return True

    username = session.get("user")

    if not username:

        session.clear()

        return False

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                SELECT auth_version
                FROM users
                WHERE username = %s
            """, (
                username,
            ))

            resultado = cursor.fetchone()

            if not resultado:

                session.clear()

                return False

            auth_version_banco = (
                resultado[0]
                if resultado[0] is not None
                else 1
            )

            auth_version_sessao = session.get(
                "auth_version"
            )

            if auth_version_sessao is None:

                session["auth_version"] = (
                    auth_version_banco
                )

                session.modified = True

                return True

            try:

                auth_version_sessao = int(
                    auth_version_sessao
                )

            except (
                ValueError,
                TypeError
            ):

                session.clear()

                return False

            if (
                auth_version_sessao
                != auth_version_banco
            ):

                session.clear()

                return False

            return True

    except Exception as e:

        print(
            "ERRO AO VALIDAR SESSÃO:",
            repr(e)
        )

        return True


# ============================================================
# REGISTRAR ÚLTIMA ATIVIDADE
# ============================================================

def registrar_atividade_usuario(username):

    if not username:

        return

    agora_timestamp = time.time()

    ultima_atualizacao = session.get(
        "_last_activity_update",
        0
    )

    try:

        ultima_atualizacao = float(
            ultima_atualizacao
        )

    except (
        ValueError,
        TypeError
    ):

        ultima_atualizacao = 0

    if (
        agora_timestamp
        - ultima_atualizacao
        < 60
    ):

        return

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                UPDATE users
                SET last_activity =
                    CURRENT_TIMESTAMP
                WHERE username = %s
            """, (
                username,
            ))

            conn.commit()

        session["_last_activity_update"] = (
            agora_timestamp
        )

        session.modified = True

    except Exception as e:

        print(
            "ERRO AO REGISTRAR ÚLTIMA ATIVIDADE:",
            repr(e)
        )


# ============================================================
# REGISTRAR ACESSO
# ============================================================

def registrar_acesso(
    username,
    login_method="senha"
):

    if not username:

        return

    try:

        ip_address = obter_ip_cliente()

        user_agent = request.headers.get(
            "User-Agent",
            "Desconhecido"
        )

        login_method = str(
            login_method or "senha"
        ).strip().lower()

        if login_method not in [
            "senha",
            "google"
        ]:

            login_method = "senha"

        ip_address = str(
            ip_address
        )[:100]

        user_agent = str(
            user_agent
        )[:1000]

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT id
                FROM users
                WHERE username = %s
            """, (
                username,
            ))

            usuario = cursor.fetchone()

            if not usuario:

                return

            cursor.execute("""
                INSERT INTO access_logs
                (
                    user_id,
                    username,
                    login_method,
                    ip_address,
                    user_agent
                )
                VALUES
                (%s, %s, %s, %s, %s)
            """, (
                usuario["id"],
                username,
                login_method,
                ip_address,
                user_agent
            ))

            cursor.execute("""
                DELETE FROM access_logs
                WHERE user_id = %s
                AND id NOT IN (
                    SELECT id
                    FROM access_logs
                    WHERE user_id = %s
                    ORDER BY created_at DESC, id DESC
                    LIMIT 50
                )
            """, (
                usuario["id"],
                usuario["id"]
            ))

            conn.commit()

    except Exception as e:

        print(
            "ERRO AO REGISTRAR ACESSO:",
            repr(e)
        )


@app.before_request
def proteger_sessao():

    if "user" not in session:

        return None

    if session.get("admin") is True:

        return None

    if validar_sessao_usuario():

        registrar_atividade_usuario(
            session.get("user")
        )

        return None

    caminho = request.path

    if (
        caminho.startswith("/api/")
        or caminho == "/chat"
        or caminho == "/history"
        or caminho == "/conversations"
        or caminho == "/new_chat"
        or caminho.startswith("/conversation/")
    ):

        return jsonify({

            "success":
                False,

            "message":
                "Sua sessão expirou. Faça login novamente.",

            "session_expired":
                True

        }), 401

    return redirect(
        url_for("login")
    )


# ============================================================
# VERSION
# ============================================================

@app.route("/version")
def version():

    return jsonify({

        "success": True,

        "version": "1.4",

        "apk_url":
            "https://drive.google.com/file/d/1mdpeCrIJNcU2DlHLabjgh17zvM2ha703/view?usp=drive_link"

    })


# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================

def criar_conversa(
    username,
    titulo="Nova conversa"
):

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO conversations
            (username, title)
            VALUES (%s, %s)
            RETURNING id
        """, (
            username,
            titulo
        ))

        resultado = cursor.fetchone()

        if not resultado:

            raise RuntimeError(
                "Não foi possível criar a conversa."
            )

        conversation_id = resultado[0]

        conn.commit()

        return conversation_id


def verificar_conversa(
    username,
    conversation_id
):

    if not conversation_id:

        return False

    try:

        conversation_id = int(
            conversation_id
        )

    except (
        ValueError,
        TypeError
    ):

        return False

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
            SELECT id
            FROM conversations
            WHERE id = %s
            AND username = %s
        """, (
            conversation_id,
            username
        ))

        return (
            cursor.fetchone()
            is not None
        )


def conversa_atual():

    if "user" not in session:

        return None

    username = session["user"]

    conversation_id = session.get(
        "conversation_id"
    )

    if conversation_id:

        try:

            if verificar_conversa(
                username,
                conversation_id
            ):

                return int(
                    conversation_id
                )

        except Exception as e:

            print(
                "ERRO AO VERIFICAR CONVERSA:",
                repr(e)
            )

    conversation_id = criar_conversa(
        username,
        "Nova conversa"
    )

    session["conversation_id"] = (
        conversation_id
    )

    session.modified = True

    return conversation_id


def gerar_titulo(mensagem):

    titulo = (
        str(mensagem or "")
        .replace("\n", " ")
        .strip()
    )

    if not titulo:

        return "Nova conversa"

    if len(titulo) > 45:

        titulo = (
            titulo[:45]
            .rstrip()
            + "..."
        )

    return titulo


def atualizar_titulo_se_necessario(
    conversation_id,
    mensagem
):

    with get_db() as conn:

        cursor = conn.cursor(
            cursor_factory=
            psycopg2.extras.RealDictCursor
        )

        cursor.execute("""
            SELECT title
            FROM conversations
            WHERE id = %s
        """, (
            conversation_id,
        ))

        conversa = cursor.fetchone()

        if not conversa:

            return

        titulo_atual = (
            conversa["title"] or ""
        ).strip()

        if titulo_atual != "Nova conversa":

            return

        novo_titulo = gerar_titulo(
            mensagem
        )

        cursor.execute("""
            UPDATE conversations
            SET title = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """, (
            novo_titulo,
            conversation_id
        ))

        conn.commit()


def obter_plan_usuario(username):

    with get_db() as conn:

        cursor = conn.cursor(
            cursor_factory=
            psycopg2.extras.RealDictCursor
        )

        cursor.execute("""
            SELECT plan
            FROM users
            WHERE username = %s
        """, (
            username,
        ))

        usuario = cursor.fetchone()

        if not usuario:

            return "free"

        return (
            usuario["plan"]
            or "free"
        ).lower()


# ============================================================
# GOOGLE - GERAR USERNAME
# ============================================================

def gerar_username_google(
    nome,
    email
):

    nome_base = (
        str(nome or "")
        .strip()
        .lower()
    )

    if not nome_base:

        nome_base = (
            str(email or "")
            .split("@")[0]
            .strip()
            .lower()
        )

    nome_base = re.sub(
        r"[^a-z0-9_]+",
        "_",
        nome_base
    )

    nome_base = (
        nome_base
        .strip("_")
    )

    if len(nome_base) < 3:

        nome_base = "google_user"

    if len(nome_base) > 24:

        nome_base = (
            nome_base[:24]
            .rstrip("_")
        )

    candidato = nome_base
    numero = 1

    while True:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                SELECT id
                FROM users
                WHERE username = %s
            """, (
                candidato,
            ))

            existe = (
                cursor.fetchone()
                is not None
            )

        if not existe:

            return candidato

        candidato = (
            f"{nome_base}_{numero}"
        )

        numero += 1

        if numero > 9999:

            candidato = (
                f"{nome_base}_{secrets.token_hex(3)}"
            )


# ============================================================
# GOOGLE - LOGIN
# ============================================================

def login_com_google(
    google_id,
    nome,
    email
):

    if not google_id:

        raise RuntimeError(
            "O Google não retornou um identificador válido."
        )

    email = (
        str(email or "")
        .strip()
        .lower()
    )

    nome = (
        str(nome or "")
        .strip()
    )

    with get_db() as conn:

        cursor = conn.cursor(
            cursor_factory=
            psycopg2.extras.RealDictCursor
        )

        cursor.execute("""
            SELECT
                id,
                username,
                plan,
                auth_version
            FROM users
            WHERE google_id = %s
        """, (
            google_id,
        ))

        usuario = cursor.fetchone()

        if usuario:

            username = usuario["username"]
            plan = usuario["plan"] or "free"

            auth_version = (
                usuario["auth_version"] or 1
            )

            session.clear()

            session["user"] = username
            session["admin"] = False
            session["plan"] = plan
            session["auth_version"] = (
                auth_version
            )

            conversation_id = criar_conversa(
                username,
                "Nova conversa"
            )

            session["conversation_id"] = (
                conversation_id
            )

            session.modified = True

            registrar_atividade_usuario(
                username
            )

            registrar_acesso(
                username,
                "google"
            )

            limpar_falhas_login_completa(
                username
            )

            return username

        usuario = None

        if email:

            cursor.execute("""
                SELECT
                    id,
                    username,
                    plan,
                    auth_version
                FROM users
                WHERE LOWER(email) = %s
            """, (
                email,
            ))

            usuario = cursor.fetchone()

        if usuario:

            cursor.execute("""
                UPDATE users
                SET google_id = %s,
                    email = %s
                WHERE id = %s
            """, (
                google_id,
                email or None,
                usuario["id"]
            ))

            conn.commit()

            username = usuario["username"]
            plan = usuario["plan"] or "free"

            auth_version = (
                usuario["auth_version"] or 1
            )

            session.clear()

            session["user"] = username
            session["admin"] = False
            session["plan"] = plan
            session["auth_version"] = (
                auth_version
            )

            conversation_id = criar_conversa(
                username,
                "Nova conversa"
            )

            session["conversation_id"] = (
                conversation_id
            )

            session.modified = True

            registrar_atividade_usuario(
                username
            )

            registrar_acesso(
                username,
                "google"
            )

            limpar_falhas_login_completa(
                username
            )

            return username

        username = gerar_username_google(
            nome,
            email
        )

        senha_temporaria = secrets.token_urlsafe(
            32
        )

        password_hash = generate_password_hash(
            senha_temporaria
        )

        cursor.execute("""
            INSERT INTO users
            (
                username,
                password,
                plan,
                google_id,
                email,
                auth_version
            )
            VALUES
            (%s, %s, %s, %s, %s, %s)
            RETURNING id, auth_version
        """, (
            username,
            password_hash,
            "free",
            google_id,
            email or None,
            1
        ))

        resultado = cursor.fetchone()

        if not resultado:

            raise RuntimeError(
                "Não foi possível criar a conta Google."
            )

        auth_version = (
            resultado["auth_version"]
            or 1
        )

        conn.commit()

    session.clear()

    session["user"] = username
    session["admin"] = False
    session["plan"] = "free"
    session["auth_version"] = (
        auth_version
    )

    conversation_id = criar_conversa(
        username,
        "Nova conversa"
    )

    session["conversation_id"] = (
        conversation_id
    )

    session.modified = True

    registrar_atividade_usuario(
        username
    )

    registrar_acesso(
        username,
        "google"
    )

    limpar_falhas_login_completa(
        username
    )

    return username


# ============================================================
# RECUPERAÇÃO DE CONTA - RESEND
# ============================================================

def enviar_email_recuperacao(
    email,
    link
):

    if not RESEND_API_KEY:

        raise RuntimeError(
            "RESEND_API_KEY não está configurada no Render."
        )

    if not RESEND_FROM:

        raise RuntimeError(
            "RESEND_FROM não está configurada no Render."
        )

    assunto = (
        "Recuperação da sua conta - Orion AI"
    )

    html = f"""
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Recuperação de conta - Orion AI</title>
</head>

<body style="
    margin:0;
    padding:0;
    background:#f3f4f6;
    font-family:Arial,sans-serif;
">

<div style="
    max-width:600px;
    margin:40px auto;
    padding:30px;
    background:#ffffff;
    border-radius:16px;
    border:1px solid #e5e7eb;
">

<h1 style="
    color:#111827;
    margin-top:0;
">
    🤖 Orion AI
</h1>

<h2 style="
    color:#111827;
">
    Recuperação de conta
</h2>

<p style="
    color:#374151;
    font-size:16px;
    line-height:1.6;
">
    Recebemos uma solicitação para redefinir
    a senha da sua conta no Orion AI.
</p>

<p style="
    color:#374151;
    font-size:16px;
    line-height:1.6;
">
    Clique no botão abaixo para criar uma nova senha:
</p>

<div style="
    text-align:center;
    margin:30px 0;
">

<a
    href="{link}"
    style="
        display:inline-block;
        padding:14px 22px;
        border-radius:10px;
        background:#7c3aed;
        color:#ffffff;
        text-decoration:none;
        font-weight:bold;
    "
>
    Redefinir senha
</a>

</div>

<p style="
    color:#6b7280;
    font-size:14px;
    line-height:1.5;
">
    Este link ficará disponível por
    {RESET_TOKEN_EXPIRATION_MINUTES} minutos.
</p>

<p style="
    color:#6b7280;
    font-size:14px;
    line-height:1.5;
">
    Se você não solicitou a recuperação,
    ignore este e-mail.
</p>

<hr style="
    border:none;
    border-top:1px solid #e5e7eb;
    margin:25px 0;
">

<p style="
    color:#9ca3af;
    font-size:12px;
">
    Orion AI
</p>

</div>

</body>
</html>
"""

    payload = {

        "from": RESEND_FROM,

        "to": [
            email
        ],

        "subject": assunto,

        "html": html

    }

    try:

        resposta = requests.post(

            "https://api.resend.com/emails",

            headers={

                "Authorization":
                    f"Bearer {RESEND_API_KEY}",

                "Content-Type":
                    "application/json",

                "Accept":
                    "application/json"

            },

            json=payload,

            timeout=20

        )

    except requests.exceptions.Timeout:

        raise RuntimeError(
            "O Resend demorou demais para responder."
        )

    except requests.exceptions.RequestException as e:

        print(
            "ERRO DE CONEXÃO COM RESEND:",
            repr(e)
        )

        raise RuntimeError(
            "Não foi possível conectar ao serviço de e-mail."
        )

    if not resposta.ok:

        try:

            erro = resposta.json()

        except Exception:

            erro = {}

        print(
            "=================================================="
        )

        print(
            "ERRO RESEND:"
        )

        print(
            "STATUS:",
            resposta.status_code
        )

        print(
            "RESPOSTA:",
            erro
        )

        print(
            "=================================================="
        )

        mensagem_erro = (
            erro.get("message")
            or erro.get("error")
            or "O Resend recusou o envio do e-mail."
        )

        raise RuntimeError(
            mensagem_erro
        )

    try:

        resultado = resposta.json()

    except Exception:

        resultado = {}

    print(
        "=================================================="
    )

    print(
        "E-MAIL DE RECUPERAÇÃO ENVIADO PELO RESEND"
    )

    print(
        "DESTINATÁRIO:",
        email
    )

    print(
        "RESULTADO:",
        resultado
    )

    print(
        "=================================================="
    )

    return resultado


# ============================================================
# CRIAR TOKEN DE RECUPERAÇÃO
# ============================================================

def criar_token_recuperacao(
    user_id
):

    token = secrets.token_urlsafe(
        48
    )

    token_hash = generate_password_hash(
        token
    )

    expiracao = (
        datetime.utcnow()
        + timedelta(
            minutes=RESET_TOKEN_EXPIRATION_MINUTES
        )
    )

    with get_db() as conn:

        cursor = conn.cursor()

        cursor.execute("""
            UPDATE password_reset_tokens
            SET used = TRUE
            WHERE user_id = %s
            AND used = FALSE
        """, (
            user_id,
        ))

        cursor.execute("""
            INSERT INTO password_reset_tokens
            (
                user_id,
                token_hash,
                expires_at,
                used
            )
            VALUES
            (%s, %s, %s, FALSE)
        """, (
            user_id,
            token_hash,
            expiracao
        ))

        conn.commit()

    return token


# ============================================================
# VALIDAR TOKEN DE RECUPERAÇÃO
# ============================================================

def validar_token_recuperacao(
    token
):

    if not token:

        return None

    agora = datetime.utcnow()

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    user_id,
                    token_hash,
                    expires_at,
                    used
                FROM password_reset_tokens
                WHERE used = FALSE
                AND expires_at > %s
                ORDER BY id DESC
            """, (
                agora,
            ))

            tokens = cursor.fetchall()

            for item in tokens:

                try:

                    valido = check_password_hash(
                        item["token_hash"],
                        token
                    )

                except Exception:

                    valido = False

                if valido:

                    return item

    except Exception as e:

        print(
            "ERRO AO VALIDAR TOKEN:",
            repr(e)
        )

    return None


# ============================================================
# VERIFICAR ADMIN
# ============================================================

def verificar_admin():

    return (
        session.get("admin") is True
        and session.get("user") == ADMIN_USERNAME
    )


# ============================================================
# GOOGLE LOGIN
# ============================================================

@app.route("/google/login")
def google_login():

    if "user" in session:

        return redirect(
            url_for("home")
        )

    if google is None:

        return jsonify({

            "success": False,

            "message":
                "Login com Google não está configurado no servidor."

        }), 500

    redirect_uri = url_for(
        "google_callback",
        _external=True
    )

    return google.authorize_redirect(
        redirect_uri
    )


# ============================================================
# GOOGLE CALLBACK
# ============================================================

@app.route("/google/callback")
def google_callback():

    if google is None:

        return jsonify({

            "success": False,

            "message":
                "Login com Google não está configurado no servidor."

        }), 500

    try:

        token = google.authorize_access_token()

        userinfo = token.get(
            "userinfo"
        )

        if not userinfo:

            userinfo = google.userinfo()

        google_id = (
            userinfo.get("sub")
        )

        nome = (
            userinfo.get("name")
            or userinfo.get("given_name")
            or "Google User"
        )

        email = (
            userinfo.get("email")
            or ""
        )

        if not google_id:

            raise RuntimeError(
                "O Google não retornou o identificador da conta."
            )

        login_com_google(
            google_id,
            nome,
            email
        )

        return redirect(
            url_for("home")
        )

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO LOGIN GOOGLE:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        return jsonify({

            "success": False,

            "message":
                "Não foi possível realizar o login com Google.",

            "error":
                str(e)

        }), 500


# ============================================================
# PÁGINAS
# ============================================================

@app.route("/")
def home():

    if "user" not in session:

        return redirect(
            url_for("login")
        )

    try:

        conversa_atual()

        session["plan"] = (
            obter_plan_usuario(
                session["user"]
            )
        )

    except Exception as e:

        print(
            "ERRO AO CARREGAR HOME:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "message":
                "Erro ao carregar o banco de dados."

        }), 500

    return render_template(
        "index.html",
        username=session["user"],
        plan=session.get(
            "plan",
            "free"
        )
    )


@app.route("/login")
def login():

    if "user" in session:

        return redirect(
            url_for("home")
        )

    return render_template(
        "login.html"
    )


@app.route("/register")
def register():

    if "user" in session:

        return redirect(
            url_for("home")
        )

    return render_template(
        "register.html"
    )


@app.route("/logout")
def logout():

    session.clear()

    return redirect(
        url_for("login")
    )


# ============================================================
# SAIR DE TODOS OS DISPOSITIVOS
# ============================================================

@app.route(
    "/api/logout-all",
    methods=["POST"]
)
def logout_all():

    if "user" not in session:

        return jsonify({

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    if verificar_admin():

        session.clear()

        return jsonify({

            "success": True,

            "message":
                "Sessão administrativa encerrada."

        })

    username = session["user"]

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                UPDATE users
                SET auth_version =
                    COALESCE(auth_version, 1) + 1
                WHERE username = %s
                RETURNING auth_version
            """, (
                username,
            ))

            resultado = cursor.fetchone()

            if not resultado:

                conn.rollback()

                session.clear()

                return jsonify({

                    "success": False,

                    "message":
                        "Usuário não encontrado."

                }), 404

            nova_auth_version = resultado[0]

            conn.commit()

        session.clear()

        print(
            "TODAS AS SESSÕES ENCERRADAS:",
            username,
            "NOVA VERSÃO:",
            nova_auth_version
        )

        return jsonify({

            "success": True,

            "message":
                "Todas as sessões foram encerradas com sucesso."

        })

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO AO SAIR DE TODOS OS DISPOSITIVOS:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        return jsonify({

            "success": False,

            "message":
                "Não foi possível encerrar todas as sessões."

        }), 500


# ============================================================
# RECUPERAR CONTA
# ============================================================

@app.route("/recuperar-conta")
def recuperar_conta():

    if "user" in session:

        return redirect(
            url_for("home")
        )

    return render_template(
        "recuperar.html"
    )


# ============================================================
# REDEFINIR SENHA - PÁGINA
# ============================================================

@app.route("/reset-password")
def reset_password_page():

    if "user" in session:

        return redirect(
            url_for("home")
        )

    token = request.args.get(
        "token",
        ""
    ).strip()

    if not token:

        return render_template(
            "reset.html",
            token_invalido=True,
            token=""
        )

    item = validar_token_recuperacao(
        token
    )

    if not item:

        return render_template(
            "reset.html",
            token_invalido=True,
            token=""
        )

    return render_template(
        "reset.html",
        token_invalido=False,
        token=token
    )


# ============================================================
# PERFIL
# ============================================================

@app.route("/perfil")
def perfil():

    if "user" not in session:

        return redirect(
            url_for("login")
        )

    username = session["user"]

    try:

        registrar_atividade_usuario(
            username
        )

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username,
                    plan,
                    email,
                    google_id,
                    last_activity
                FROM users
                WHERE username = %s
            """, (
                username,
            ))

            usuario = cursor.fetchone()

            if not usuario:

                session.clear()

                return redirect(
                    url_for("login")
                )

            cursor.execute("""
                SELECT COUNT(*) AS total
                FROM conversations
                WHERE username = %s
            """, (
                username,
            ))

            resultado_conversas = (
                cursor.fetchone()
            )

            total_conversas = (
                resultado_conversas["total"]
                if resultado_conversas
                else 0
            )

            cursor.execute("""
                SELECT COUNT(*) AS total
                FROM chat_messages cm
                INNER JOIN conversations c
                ON cm.conversation_id = c.id
                WHERE c.username = %s
            """, (
                username,
            ))

            resultado_mensagens = (
                cursor.fetchone()
            )

            total_mensagens = (
                resultado_mensagens["total"]
                if resultado_mensagens
                else 0
            )

            cursor.execute("""
                SELECT
                    login_method,
                    ip_address,
                    user_agent,
                    created_at
                FROM access_logs
                WHERE username = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 10
            """, (
                username,
            ))

            registros_acessos = (
                cursor.fetchall()
            )

        historico_acessos = [

            {
                "login_method":
                    item["login_method"],

                "ip_address":
                    item["ip_address"]
                    or "Desconhecido",

                "user_agent":
                    item["user_agent"]
                    or "Desconhecido",

                "created_at":
                    (
                        item["created_at"].strftime(
                            "%d/%m/%Y às %H:%M"
                        )
                        if item["created_at"]
                        else "Data desconhecida"
                    )
            }

            for item in registros_acessos

        ]

        return render_template(
            "perfil.html",
            username=usuario["username"],
            plan=usuario["plan"] or "free",
            total_conversas=total_conversas,
            total_mensagens=total_mensagens,
            email=usuario["email"] or "",
            login_google=bool(
                usuario["google_id"]
            ),
            ultima_atividade=(
                usuario["last_activity"].strftime(
                    "%d/%m/%Y às %H:%M"
                )
                if usuario["last_activity"]
                else "Nenhuma atividade registrada"
            ),
            historico_acessos=historico_acessos
        )

    except Exception as e:

        print(
            "ERRO AO CARREGAR PERFIL:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "message":
                "Erro ao carregar o perfil.",

            "error":
                str(e)

        }), 500


# ============================================================
# API DO PERFIL
# ============================================================

@app.route("/api/profile")
def api_profile():

    if "user" not in session:

        return jsonify({

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    username = session["user"]

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username,
                    plan,
                    email,
                    google_id,
                    last_activity
                FROM users
                WHERE username = %s
            """, (
                username,
            ))

            usuario = cursor.fetchone()

            if not usuario:

                return jsonify({

                    "success": False,

                    "message":
                        "Usuário não encontrado."

                }), 404

            cursor.execute("""
                SELECT COUNT(*) AS total
                FROM conversations
                WHERE username = %s
            """, (
                username,
            ))

            resultado_conversas = (
                cursor.fetchone()
            )

            total_conversas = (
                resultado_conversas["total"]
                if resultado_conversas
                else 0
            )

            cursor.execute("""
                SELECT COUNT(*) AS total
                FROM chat_messages cm
                INNER JOIN conversations c
                ON cm.conversation_id = c.id
                WHERE c.username = %s
            """, (
                username,
            ))

            resultado_mensagens = (
                cursor.fetchone()
            )

            total_mensagens = (
                resultado_mensagens["total"]
                if resultado_mensagens
                else 0
            )

        return jsonify({

            "success": True,

            "id":
                usuario["id"],

            "username":
                usuario["username"],

            "plan":
                usuario["plan"] or "free",

            "email":
                usuario["email"] or "",

            "google":
                bool(
                    usuario["google_id"]
                ),

            "total_conversas":
                total_conversas,

            "total_mensagens":
                total_mensagens,

            "last_activity":
                (
                    usuario["last_activity"].isoformat()
                    if usuario["last_activity"]
                    else None
                )

        })

    except Exception as e:

        print(
            "ERRO API PROFILE:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "message":
                "Erro ao carregar o perfil.",

            "error":
                str(e)

        }), 500


# ============================================================
# API - HISTÓRICO DE ACESSOS
# ============================================================

@app.route("/api/access-history")
def access_history():

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro.",

            "accesses":
                []

        }), 401

    username = session["user"]

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    login_method,
                    ip_address,
                    user_agent,
                    created_at
                FROM access_logs
                WHERE username = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 10
            """, (
                username,
            ))

            registros = cursor.fetchall()

        acessos = [

            {

                "login_method":
                    item["login_method"],

                "ip_address":
                    item["ip_address"]
                    or "Desconhecido",

                "user_agent":
                    item["user_agent"]
                    or "Desconhecido",

                "created_at":
                    (
                        item["created_at"].isoformat()
                        if item["created_at"]
                        else None
                    )

            }

            for item in registros

        ]

        return jsonify({

            "success":
                True,

            "accesses":
                acessos

        })

    except Exception as e:

        print(
            "ERRO ACCESS HISTORY:",
            repr(e)
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao carregar o histórico de acessos.",

            "accesses":
                []

        }), 500


# ============================================================
# ALTERAR NOME DE USUÁRIO
# ============================================================

@app.route(
    "/api/change-username",
    methods=["POST"]
)
def change_username():

    if "user" not in session:

        return jsonify({

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    if verificar_admin():

        return jsonify({

            "success": False,

            "message":
                "O administrador não pode alterar o nome de usuário."

        }), 400

    data = request.get_json(
        silent=True
    ) or {}

    novo_username = str(
        data.get("username")
        or data.get("new_username")
        or ""
    ).strip()

    if not novo_username:

        return jsonify({

            "success": False,

            "message":
                "Digite um novo nome de usuário."

        }), 400

    if len(novo_username) < 3:

        return jsonify({

            "success": False,

            "message":
                "O usuário precisa ter pelo menos 3 caracteres."

        }), 400

    if len(novo_username) > 30:

        return jsonify({

            "success": False,

            "message":
                "O usuário pode ter no máximo 30 caracteres."

        }), 400

    if not re.fullmatch(
        r"[A-Za-z0-9_]+",
        novo_username
    ):

        return jsonify({

            "success": False,

            "message":
                "Use apenas letras, números e _ no nome de usuário."

        }), 400

    if (
        novo_username.lower()
        == ADMIN_USERNAME.lower()
    ):

        return jsonify({

            "success": False,

            "message":
                "Esse nome de usuário não está disponível."

        }), 409

    username_atual = session["user"]

    if novo_username == username_atual:

        return jsonify({

            "success": False,

            "message":
                "Digite um nome de usuário diferente do atual."

        }), 400

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                SELECT id
                FROM users
                WHERE username = %s
            """, (
                novo_username,
            ))

            if cursor.fetchone():

                return jsonify({

                    "success": False,

                    "message":
                        "Esse nome de usuário já está em uso."

                }), 409

            cursor.execute("""
                UPDATE users
                SET username = %s
                WHERE username = %s
            """, (
                novo_username,
                username_atual
            ))

            if cursor.rowcount == 0:

                conn.rollback()

                return jsonify({

                    "success": False,

                    "message":
                        "Usuário atual não foi encontrado."

                }), 404

            cursor.execute("""
                UPDATE conversations
                SET username = %s
                WHERE username = %s
            """, (
                novo_username,
                username_atual
            ))

            cursor.execute("""
                UPDATE messages
                SET username = %s
                WHERE username = %s
            """, (
                novo_username,
                username_atual
            ))

            cursor.execute("""
                UPDATE access_logs
                SET username = %s
                WHERE username = %s
            """, (
                novo_username,
                username_atual
            ))

            conn.commit()

        session["user"] = novo_username

        session["auth_version"] = (
            session.get(
                "auth_version",
                1
            )
        )

        session.modified = True

        print(
            "USUÁRIO ALTERADO:",
            username_atual,
            "->",
            novo_username
        )

        return jsonify({

            "success": True,

            "message":
                "Nome de usuário alterado com sucesso.",

            "username":
                novo_username

        })

    except psycopg2.IntegrityError:

        return jsonify({

            "success": False,

            "message":
                "Esse nome de usuário já está em uso."

        }), 409

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO AO ALTERAR NOME DE USUÁRIO:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        return jsonify({

            "success": False,

            "message":
                "Erro interno ao alterar o nome de usuário.",

            "error":
                str(e)

        }), 500


# ============================================================
# ALTERAR SENHA
# ============================================================

@app.route(
    "/api/change-password",
    methods=["POST"]
)
def change_password():

    if "user" not in session:

        return jsonify({

            "success": False,

            "message":
                "Faça login primeiro."

        }), 401

    data = request.get_json(
        silent=True
    ) or {}

    current_password = str(
        data.get("current_password")
        or ""
    )

    new_password = str(
        data.get("new_password")
        or ""
    )

    confirm_password = str(
        data.get("confirm_password")
        or ""
    )

    if (
        not current_password
        or not new_password
        or not confirm_password
    ):

        return jsonify({

            "success": False,

            "message":
                "Preencha todos os campos."

        }), 400

    if len(new_password) < 6:

        return jsonify({

            "success": False,

            "message":
                "A nova senha precisa ter pelo menos 6 caracteres."

        }), 400

    if len(new_password) > 200:

        return jsonify({

            "success": False,

            "message":
                "A nova senha é muito longa."

        }), 400

    if not any(
        caractere.isdigit()
        for caractere in new_password
    ):

        return jsonify({

            "success": False,

            "message":
                "A nova senha precisa ter pelo menos 1 número."

        }), 400

    if new_password != confirm_password:

        return jsonify({

            "success": False,

            "message":
                "A confirmação da senha não confere."

        }), 400

    if current_password == new_password:

        return jsonify({

            "success": False,

            "message":
                "A nova senha precisa ser diferente da senha atual."

        }), 400

    username = session["user"]

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username,
                    password,
                    auth_version
                FROM users
                WHERE username = %s
            """, (
                username,
            ))

            usuario = cursor.fetchone()

            if not usuario:

                session.clear()

                return jsonify({

                    "success": False,

                    "message":
                        "Usuário não encontrado."

                }), 404

            senha_correta = False

            try:

                senha_correta = (
                    check_password_hash(
                        usuario["password"],
                        current_password
                    )
                )

            except Exception:

                senha_correta = False

            if not senha_correta:

                senha_antiga = (
                    usuario["password"]
                )

                if senha_antiga == current_password:

                    senha_correta = True

            if not senha_correta:

                return jsonify({

                    "success": False,

                    "message":
                        "A senha atual está incorreta."

                }), 401

            nova_hash = (
                generate_password_hash(
                    new_password
                )
            )

            cursor.execute("""
                UPDATE users
                SET password = %s,
                    auth_version =
                        COALESCE(auth_version, 1) + 1
                WHERE id = %s
                RETURNING auth_version
            """, (
                nova_hash,
                usuario["id"]
            ))

            resultado = cursor.fetchone()

            if not resultado:

                conn.rollback()

                return jsonify({

                    "success": False,

                    "message":
                        "Não foi possível atualizar a senha."

                }), 500

            nova_auth_version = (
                resultado["auth_version"]
            )

            conn.commit()

        session["auth_version"] = (
            nova_auth_version
        )

        session.modified = True

        print(
            "SENHA ALTERADA COM SUCESSO:",
            username,
            "VERSÃO DA SESSÃO:",
            nova_auth_version
        )

        return jsonify({

            "success": True,

            "message":
                "Senha alterada com sucesso."

        })

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO AO ALTERAR SENHA:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        return jsonify({

            "success": False,

            "message":
                "Erro interno ao alterar a senha."

        }), 500


# ============================================================
# API - SOLICITAR RECUPERAÇÃO
# ============================================================

@app.route(
    "/api/forgot-password",
    methods=["POST"]
)
def forgot_password():

    data = request.get_json(
        silent=True
    ) or {}

    email = str(
        data.get("email") or ""
    ).strip().lower()

    resposta_padrao = {

        "success": True,

        "message":
            "Se existir uma conta com esse e-mail, "
            "você receberá um link para redefinir sua senha."

    }

    if not email:

        return jsonify(
            resposta_padrao
        )

    if (
        len(email) > 320
        or "@" not in email
        or "." not in email.split("@")[-1]
    ):

        return jsonify({

            "success": False,

            "message":
                "Digite um e-mail válido."

        }), 400

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username,
                    email
                FROM users
                WHERE LOWER(email) = %s
                LIMIT 1
            """, (
                email,
            ))

            usuario = cursor.fetchone()

        if not usuario:

            return jsonify(
                resposta_padrao
            )

        token = criar_token_recuperacao(
            usuario["id"]
        )

        link = url_for(
            "reset_password_page",
            token=token,
            _external=True
        )

        enviar_email_recuperacao(
            email,
            link
        )

        print(
            "RECUPERAÇÃO DE CONTA ENVIADA:",
            usuario["username"],
            email
        )

        return jsonify(
            resposta_padrao
        )

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO RECUPERAÇÃO DE CONTA:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        return jsonify({

            "success": False,

            "message":
                "Não foi possível enviar o e-mail de recuperação agora."

        }), 500


# ============================================================
# API - REDEFINIR SENHA
# ============================================================

@app.route(
    "/api/reset-password",
    methods=["POST"]
)
def reset_password():

    data = request.get_json(
        silent=True
    ) or {}

    token = str(
        data.get("token") or ""
    ).strip()

    nova_senha = str(
        data.get("new_password") or ""
    )

    confirmacao = str(
        data.get("confirm_password") or ""
    )

    if (
        not token
        or not nova_senha
        or not confirmacao
    ):

        return jsonify({

            "success": False,

            "message":
                "Preencha todos os campos."

        }), 400

    if len(nova_senha) < 6:

        return jsonify({

            "success": False,

            "message":
                "A senha precisa ter pelo menos 6 caracteres."

        }), 400

    if len(nova_senha) > 200:

        return jsonify({

            "success": False,

            "message":
                "A senha é muito longa."

        }), 400

    if not any(
        caractere.isdigit()
        for caractere in nova_senha
    ):

        return jsonify({

            "success": False,

            "message":
                "A senha precisa ter pelo menos 1 número."

        }), 400

    if nova_senha != confirmacao:

        return jsonify({

            "success": False,

            "message":
                "As senhas não são iguais."

        }), 400

    item = validar_token_recuperacao(
        token
    )

    if not item:

        return jsonify({

            "success": False,

            "message":
                "Este link de recuperação é inválido ou expirou."

        }), 400

    nova_hash = (
        generate_password_hash(
            nova_senha
        )
    )

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                UPDATE users
                SET password = %s,
                    auth_version =
                        COALESCE(auth_version, 1) + 1
                WHERE id = %s
            """, (
                nova_hash,
                item["user_id"]
            ))

            if cursor.rowcount == 0:

                conn.rollback()

                return jsonify({

                    "success": False,

                    "message":
                        "Usuário não encontrado."

                }), 404

            cursor.execute("""
                UPDATE password_reset_tokens
                SET used = TRUE
                WHERE id = %s
            """, (
                item["id"],
            ))

            cursor.execute("""
                UPDATE password_reset_tokens
                SET used = TRUE
                WHERE user_id = %s
                AND id != %s
                AND used = FALSE
            """, (
                item["user_id"],
                item["id"]
            ))

            conn.commit()

        print(
            "SENHA RECUPERADA COM SUCESSO:",
            item["user_id"]
        )

        return jsonify({

            "success": True,

            "message":
                "Senha redefinida com sucesso."

        })

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO AO REDEFINIR SENHA:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        return jsonify({

            "success": False,

            "message":
                "Erro interno ao redefinir senha."

        }), 500


# ============================================================
# CONFIGURAÇÕES
# ============================================================

@app.route("/configuracoes")
def configuracoes():

    if "user" not in session:

        return redirect(
            url_for("login")
        )

    return render_template(
        "configuracoes.html"
    )


# ============================================================
# LOGIN ADMIN
# ============================================================

@app.route(
    "/admin/login",
    methods=["GET", "POST"]
)
def admin_login():

    if request.method == "GET":

        if verificar_admin():

            return redirect(
                url_for("admin_dashboard")
            )

        return render_template(
            "admin_login.html"
        )

    data = request.get_json(
        silent=True
    ) or {}

    username = str(
        data.get("username") or ""
    ).strip()

    password = str(
        data.get("password") or ""
    )

    if not username or not password:

        return jsonify({

            "success": False,

            "message":
                "Preencha usuário e senha."

        }), 400

    if not ADMIN_USERNAME:

        return jsonify({

            "success": False,

            "message":
                "ADMIN_USERNAME não está configurado."

        }), 500

    if not ADMIN_PASSWORD:

        return jsonify({

            "success": False,

            "message":
                "ADMIN_PASSWORD não está configurado no servidor."

        }), 500

    # --------------------------------------------------------
    # PROTEÇÃO DO LOGIN ADMINISTRATIVO
    # --------------------------------------------------------

    protecao_admin = (
        verificar_protecao_login(
            ADMIN_USERNAME
        )
    )

    if protecao_admin["blocked"]:

        return jsonify({

            "success":
                False,

            "message":
                protecao_admin["message"],

            "locked":
                True,

            "retry_after":
                protecao_admin["retry_after"]

        }), 429

    if username != ADMIN_USERNAME:

        resultado_falha = (
            registrar_falha_login_completa(
                ADMIN_USERNAME
            )
        )

        mensagem = (
            "Usuário ou senha administrativos incorretos."
        )

        if resultado_falha["blocked"]:

            mensagem = (
                "Muitas tentativas incorretas. "
                "O acesso administrativo foi "
                "temporariamente bloqueado."
            )

        return jsonify({

            "success":
                False,

            "message":
                mensagem,

            "locked":
                resultado_falha["blocked"],

            "retry_after":
                resultado_falha["seconds"]

        }), 401

    if password != ADMIN_PASSWORD:

        resultado_falha = (
            registrar_falha_login_completa(
                ADMIN_USERNAME
            )
        )

        mensagem = (
            "Usuário ou senha administrativos incorretos."
        )

        status = 401

        if resultado_falha["blocked"]:

            mensagem = (
                "Muitas tentativas incorretas. "
                "O acesso administrativo foi "
                "temporariamente bloqueado."
            )

            status = 429

        return jsonify({

            "success":
                False,

            "message":
                mensagem,

            "locked":
                resultado_falha["blocked"],

            "retry_after":
                resultado_falha["seconds"]

        }), status

    # Login administrativo correto
    limpar_falhas_login_completa(
        ADMIN_USERNAME
    )

    session.clear()

    session["admin"] = True
    session["user"] = ADMIN_USERNAME
    session["plan"] = "premium"

    return jsonify({

        "success": True,

        "message":
            "Login administrativo realizado com sucesso."

    })


# ============================================================
# PAINEL ADMIN
# ============================================================

@app.route("/admin")
def admin():

    return redirect(
        url_for("admin_login")
    )


@app.route("/admin/dashboard")
def admin_dashboard():

    if not verificar_admin():

        return redirect(
            url_for("admin_login")
        )

    return render_template(
        "admin.html",
        username=ADMIN_USERNAME
    )


@app.route("/admin/logout")
def admin_logout():

    session.clear()

    return redirect(
        url_for("admin_login")
    )


# ============================================================
# API ADMIN - USUÁRIOS
# ============================================================

@app.route("/api/admin/users")
def admin_users():

    if not verificar_admin():

        return jsonify({

            "success": False,

            "message":
                "Acesso negado."

        }), 403

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username,
                    plan
                FROM users
                ORDER BY id DESC
            """)

            usuarios = cursor.fetchall()

    except Exception as e:

        print(
            "ERRO ADMIN USERS:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "message":
                "Erro ao consultar usuários."

        }), 500

    total = len(usuarios)

    premium = sum(

        1

        for usuario in usuarios

        if (
            usuario["plan"]
            or "free"
        ).lower() == "premium"

    )

    free = total - premium

    return jsonify({

        "success": True,

        "stats": {

            "total": total,

            "free": free,

            "premium": premium

        },

        "users": [

            {

                "id":
                    usuario["id"],

                "username":
                    usuario["username"],

                "plan":
                    usuario["plan"]
                    or "free"

            }

            for usuario in usuarios

        ]

    })


# ============================================================
# ALTERAR PLANO
# ============================================================

@app.route(
    "/api/admin/user/<int:user_id>/plan",
    methods=["POST"]
)
def admin_change_plan(user_id):

    if not verificar_admin():

        return jsonify({

            "success": False,

            "message":
                "Acesso negado."

        }), 403

    data = request.get_json(
        silent=True
    ) or {}

    plan = str(
        data.get("plan") or ""
    ).strip().lower()

    if plan not in [
        "free",
        "premium"
    ]:

        return jsonify({

            "success": False,

            "message":
                "Plano inválido."

        }), 400

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username
                FROM users
                WHERE id = %s
            """, (
                user_id,
            ))

            usuario = cursor.fetchone()

            if not usuario:

                return jsonify({

                    "success": False,

                    "message":
                        "Usuário não encontrado."

                }), 404

            if usuario["username"] == ADMIN_USERNAME:

                return jsonify({

                    "success": False,

                    "message":
                        "O administrador não pode ter o plano alterado."

                }), 400

            cursor.execute("""
                UPDATE users
                SET plan = %s
                WHERE id = %s
            """, (
                plan,
                user_id
            ))

            conn.commit()

    except Exception as e:

        print(
            "ERRO ALTERAR PLANO:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "message":
                "Erro interno ao alterar o plano."

        }), 500

    return jsonify({

        "success": True,

        "message":
            "Plano atualizado com sucesso.",

        "plan":
            plan

    })


# ============================================================
# EXCLUIR USUÁRIO
# ============================================================

@app.route(
    "/api/admin/user/<int:user_id>/delete",
    methods=["DELETE"]
)
def admin_delete_user(user_id):

    if not verificar_admin():

        return jsonify({

            "success": False,

            "message":
                "Acesso negado."

        }), 403

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT username
                FROM users
                WHERE id = %s
            """, (
                user_id,
            ))

            usuario = cursor.fetchone()

            if not usuario:

                return jsonify({

                    "success": False,

                    "message":
                        "Usuário não encontrado."

                }), 404

            if usuario["username"] == ADMIN_USERNAME:

                return jsonify({

                    "success": False,

                    "message":
                        "Você não pode excluir o administrador."

                }), 400

            username = usuario["username"]

            cursor.execute("""
                DELETE FROM chat_messages
                WHERE conversation_id IN (
                    SELECT id
                    FROM conversations
                    WHERE username = %s
                )
            """, (
                username,
            ))

            cursor.execute("""
                DELETE FROM conversations
                WHERE username = %s
            """, (
                username,
            ))

            cursor.execute("""
                DELETE FROM messages
                WHERE username = %s
            """, (
                username,
            ))

            cursor.execute("""
                DELETE FROM password_reset_tokens
                WHERE user_id = %s
            """, (
                user_id,
            ))

            cursor.execute("""
                DELETE FROM users
                WHERE id = %s
            """, (
                user_id,
            ))

            conn.commit()

    except Exception as e:

        print(
            "ERRO EXCLUIR USUÁRIO:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "message":
                "Erro interno ao excluir usuário."

        }), 500

    return jsonify({

        "success": True,

        "message":
            "Usuário excluído com sucesso."

    })


# ============================================================
# REGISTER
# ============================================================

@app.route(
    "/api/register",
    methods=["POST"]
)
def api_register():

    data = request.get_json(
        silent=True
    ) or {}

    username = str(
        data.get("username") or ""
    ).strip()

    password = str(
        data.get("password") or ""
    )

    email = str(
        data.get("email") or ""
    ).strip().lower()

    if not username or not password or not email:

        return jsonify({

            "success": False,

            "message":
                "Preencha todos os campos."

        }), 400

    if len(username) < 3:

        return jsonify({

            "success": False,

            "message":
                "O usuário precisa ter pelo menos 3 caracteres."

        }), 400

    if len(username) > 30:

        return jsonify({

            "success": False,

            "message":
                "O usuário pode ter no máximo 30 caracteres."

        }), 400

    if not re.fullmatch(
        r"[A-Za-z0-9_]+",
        username
    ):

        return jsonify({

            "success": False,

            "message":
                "Use apenas letras, números e _ no nome de usuário."

        }), 400

    if len(password) < 6:

        return jsonify({

            "success": False,

            "message":
                "A senha precisa ter pelo menos 6 caracteres."

        }), 400

    if not any(
        caractere.isdigit()
        for caractere in password
    ):

        return jsonify({

            "success": False,

            "message":
                "A senha precisa ter pelo menos 1 número."

        }), 400

    if len(password) > 200:

        return jsonify({

            "success": False,

            "message":
                "A senha é muito longa."

        }), 400

    if (
        len(email) > 320
        or "@" not in email
        or "." not in email.split("@")[-1]
    ):

        return jsonify({

            "success": False,

            "message":
                "Digite um e-mail válido."

        }), 400

    if (
        username.lower()
        == ADMIN_USERNAME.lower()
    ):

        return jsonify({

            "success": False,

            "message":
                "Esse nome de usuário não está disponível."

        }), 409

    password_hash = (
        generate_password_hash(
            password
        )
    )

    try:

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                SELECT id
                FROM users
                WHERE LOWER(email) = %s
            """, (
                email,
            ))

            if cursor.fetchone():

                return jsonify({

                    "success": False,

                    "message":
                        "Esse e-mail já está cadastrado."

                }), 409

            cursor.execute("""
                INSERT INTO users
                (
                    username,
                    password,
                    plan,
                    email,
                    auth_version,
                    last_activity
                )
                VALUES
                (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, (
                username,
                password_hash,
                "free",
                email,
                1
            ))

            conn.commit()

        return jsonify({

            "success": True,

            "message":
                "Conta criada com sucesso."

        })

    except psycopg2.IntegrityError:

        return jsonify({

            "success": False,

            "message":
                "Usuário ou e-mail já existe."

        }), 409

    except Exception as e:

        print(
            "ERRO REGISTER:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "message":
                "Erro interno ao criar conta."

        }), 500


# ============================================================
# LOGIN
# ============================================================

@app.route(
    "/api/login",
    methods=["POST"]
)
def api_login():

    data = request.get_json(
        silent=True
    ) or {}

    username = str(
        data.get("username") or ""
    ).strip()

    password = str(
        data.get("password") or ""
    )

    if not username or not password:

        return jsonify({

            "success": False,

            "message":
                "Preencha usuário e senha."

        }), 400

    if (
        username.lower()
        == ADMIN_USERNAME.lower()
    ):

        return jsonify({

            "success": False,

            "message":
                "Use o acesso administrativo."

        }), 403

    # --------------------------------------------------------
    # VERIFICAR BLOQUEIO ANTES DE CONSULTAR A SENHA
    # --------------------------------------------------------

    protecao = (
        verificar_protecao_login(
            username
        )
    )

    if protecao["blocked"]:

        return jsonify({

            "success":
                False,

            "message":
                protecao["message"],

            "locked":
                True,

            "retry_after":
                protecao["retry_after"]

        }), 429

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    username,
                    password,
                    plan,
                    auth_version
                FROM users
                WHERE username = %s
            """, (
                username,
            ))

            user = cursor.fetchone()

            if not user:

                resultado_falha = (
                    registrar_falha_login_completa(
                        username
                    )
                )

                mensagem = (
                    "Usuário ou senha incorretos."
                )

                status = 401

                if resultado_falha["blocked"]:

                    mensagem = (
                        "Muitas tentativas incorretas. "
                        "Este acesso foi temporariamente "
                        "bloqueado."
                    )

                    status = 429

                return jsonify({

                    "success": False,

                    "message":
                        mensagem,

                    "locked":
                        resultado_falha["blocked"],

                    "retry_after":
                        resultado_falha["seconds"]

                }), status

            senha_correta = False

            try:

                senha_correta = (
                    check_password_hash(
                        user["password"],
                        password
                    )
                )

            except Exception:

                senha_correta = False

            if not senha_correta:

                senha_antiga = (
                    user["password"]
                )

                if senha_antiga == password:

                    senha_correta = True

                    nova_hash = (
                        generate_password_hash(
                            password
                        )
                    )

                    cursor.execute("""
                        UPDATE users
                        SET password = %s
                        WHERE id = %s
                    """, (
                        nova_hash,
                        user["id"]
                    ))

                    conn.commit()

            if not senha_correta:

                resultado_falha = (
                    registrar_falha_login_completa(
                        user["username"]
                    )
                )

                mensagem = (
                    "Usuário ou senha incorretos."
                )

                status = 401

                if resultado_falha["blocked"]:

                    mensagem = (
                        "Muitas tentativas incorretas. "
                        "Esta conta foi temporariamente "
                        "bloqueada."
                    )

                    status = 429

                return jsonify({

                    "success": False,

                    "message":
                        mensagem,

                    "locked":
                        resultado_falha["blocked"],

                    "retry_after":
                        resultado_falha["seconds"]

                }), status

            auth_version = (
                user["auth_version"]
                or 1
            )

            session.clear()

            session["user"] = (
                user["username"]
            )

            session["admin"] = False

            session["plan"] = (
                user["plan"]
                or "free"
            )

            session["auth_version"] = (
                auth_version
            )

        # ----------------------------------------------------
        # LOGIN CORRETO
        # ----------------------------------------------------

        limpar_falhas_login_completa(
            user["username"]
        )

        registrar_atividade_usuario(
            user["username"]
        )

        registrar_acesso(
            user["username"],
            "senha"
        )

        conversation_id = criar_conversa(
            user["username"],
            "Nova conversa"
        )

        session["conversation_id"] = (
            conversation_id
        )

        session.modified = True

        return jsonify({

            "success": True,

            "plan":
                session["plan"],

            "conversation_id":
                conversation_id

        })

    except Exception as e:

        print(
            "ERRO LOGIN:",
            repr(e)
        )

        return jsonify({

            "success": False,

            "message":
                "Erro interno no servidor."

        }), 500


# ============================================================
# CHAT COM STREAMING
# ============================================================

@app.route(
    "/chat",
    methods=["POST"]
)
def chat():

    if "user" not in session:

        return jsonify({

            "reply":
                "Faça login primeiro.",

            "message":
                "Faça login primeiro.",

            "success":
                False

        }), 401

    mensagem_id = None
    conversation_id = None

    try:

        data = request.get_json(
            silent=True
        ) or {}

        mensagem = str(
            data.get("message") or ""
        ).strip()

        imagem_base64 = data.get(
            "image"
        )

        tipo_imagem = data.get(
            "image_type"
        )

        if len(mensagem) > 12000:

            mensagem_erro = (
                "Sua mensagem é muito grande. "
                "Tente enviar uma mensagem menor."
            )

            return jsonify({

                "reply":
                    mensagem_erro,

                "message":
                    mensagem_erro,

                "success":
                    False

            }), 400

        if imagem_base64:

            if not isinstance(
                imagem_base64,
                str
            ):

                mensagem_erro = (
                    "Imagem inválida."
                )

                return jsonify({

                    "reply":
                        mensagem_erro,

                    "message":
                        mensagem_erro,

                    "success":
                        False

                }), 400

            if not tipo_imagem:

                tipo_imagem = "image/jpeg"

            tipos_permitidos = [
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif"
            ]

            if tipo_imagem not in tipos_permitidos:

                mensagem_erro = (
                    "Formato de imagem não suportado. "
                    "Use JPG, PNG, WEBP ou GIF."
                )

                return jsonify({

                    "reply":
                        mensagem_erro,

                    "message":
                        mensagem_erro,

                    "success":
                        False

                }), 400

            if len(imagem_base64) > 27_000_000:

                mensagem_erro = (
                    "A imagem é muito grande. "
                    "Use uma imagem menor."
                )

                return jsonify({

                    "reply":
                        mensagem_erro,

                    "message":
                        mensagem_erro,

                    "success":
                        False

                }), 400

        if (
            not mensagem
            and not imagem_base64
        ):

            mensagem_erro = (
                "Digite uma mensagem ou envie uma imagem."
            )

            return jsonify({

                "reply":
                    mensagem_erro,

                "message":
                    mensagem_erro,

                "success":
                    False

            }), 400

        username = session["user"]

        plan = obter_plan_usuario(
            username
        )

        session["plan"] = plan

        conversation_id = (
            conversa_atual()
        )

        if not conversation_id:

            mensagem_erro = (
                "Não foi possível abrir a conversa."
            )

            return jsonify({

                "reply":
                    mensagem_erro,

                "message":
                    mensagem_erro,

                "success":
                    False

            }), 500

        with get_db() as conn:

            cursor = conn.cursor()

            if plan == "free":

                cursor.execute("""
                    SELECT COUNT(*)
                    FROM chat_messages cm
                    INNER JOIN conversations c
                    ON cm.conversation_id = c.id
                    WHERE c.username = %s
                    AND cm.sender = 'user'
                    AND DATE(cm.created_at) =
                        CURRENT_DATE
                """, (
                    username,
                ))

                total = cursor.fetchone()[0]

                if total >= 20:

                    mensagem_limite = (
                        "Limite diário do plano FREE "
                        "atingido (20 mensagens)."
                    )

                    return jsonify({

                        "reply":
                            mensagem_limite,

                        "message":
                            mensagem_limite,

                        "limit_reached":
                            True,

                        "success":
                            False,

                        "plan":
                            plan

                    }), 429

            mensagem_salva = mensagem

            if imagem_base64:

                if mensagem:

                    mensagem_salva = (
                        "📷 [Imagem enviada]\n\n"
                        + mensagem
                    )

                else:

                    mensagem_salva = (
                        "📷 [Imagem enviada]"
                    )

            cursor.execute("""
                INSERT INTO chat_messages
                (conversation_id, sender, message)
                VALUES (%s, %s, %s)
                RETURNING id
            """, (
                conversation_id,
                "user",
                mensagem_salva
            ))

            resultado = cursor.fetchone()

            if not resultado:

                raise RuntimeError(
                    "Não foi possível salvar a mensagem."
                )

            mensagem_id = resultado[0]

            cursor.execute("""
                UPDATE conversations
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (
                conversation_id,
            ))

            conn.commit()

        if mensagem:

            try:

                atualizar_titulo_se_necessario(
                    conversation_id,
                    mensagem
                )

            except Exception as erro_titulo:

                print(
                    "ERRO AO ATUALIZAR TÍTULO:",
                    repr(erro_titulo)
                )

        agora = datetime.now()

        data_atual = agora.strftime(
            "%d/%m/%Y"
        )

        hora_atual = agora.strftime(
            "%H:%M"
        )

        if plan == "free":

            estilo = """
Responda de forma clara, útil e objetiva.

Prefira respostas relativamente curtas,
mas não deixe de explicar o necessário.

Mantenha boa qualidade e organização.
"""

        else:

            estilo = """
Responda de forma completa, detalhada
e inteligente.

Quando necessário, explique passo a passo.

Use exemplos quando eles ajudarem
o usuário a entender.
"""

        mensagens_ia = [

            {
                "role": "system",
                "content": f"""
Você é o Orion AI, um assistente
virtual brasileiro inteligente, útil,
natural e amigável.

Sua função é ajudar o usuário a
entender assuntos, estudar,
programar, resolver problemas,
criar ideias, escrever textos
e conversar.

Você também possui visão.

Quando o usuário enviar uma imagem:

- analise a imagem cuidadosamente;
- descreva o que realmente consegue ver;
- responda perguntas sobre a imagem;
- leia textos visíveis quando possível;
- analise gráficos, documentos,
  objetos e capturas de tela quando possível;
- não invente detalhes que não consegue identificar.

A data atual é:
{data_atual}

A hora atual é:
{hora_atual}

Responda em português do Brasil
quando o usuário falar português.

Tente entender erros de escrita,
abreviações e linguagem informal.

Use o histórico da conversa.

Responda diretamente e não fique
repetindo a pergunta.

Use Markdown quando ajudar.

Quando o usuário pedir código:

- entregue código funcional;
- preserve a estrutura existente;
- não remova funcionalidades sem motivo;
- explique brevemente as mudanças;
- se pedir arquivo inteiro,
  entregue o arquivo inteiro.

Não invente conscientemente
datas, números, nomes,
estatísticas ou informações.

Se não souber algo,
diga claramente.

Seja inteligente, natural,
educado, claro, útil e direto.

PLANO:

{estilo}
"""
            }

        ]

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    sender,
                    message
                FROM chat_messages
                WHERE conversation_id = %s
                AND id <> %s
                ORDER BY id DESC
                LIMIT 8
            """, (
                conversation_id,
                mensagem_id
            ))

            historico = cursor.fetchall()

        for item in reversed(
            historico
        ):

            role = (
                "assistant"
                if item["sender"] == "bot"
                else "user"
            )

            mensagens_ia.append({

                "role":
                    role,

                "content":
                    item["message"]

            })

        conteudo_usuario = []

        if mensagem:

            conteudo_usuario.append({

                "type":
                    "text",

                "text":
                    mensagem

            })

        if imagem_base64:

            conteudo_usuario.append({

                "type":
                    "image_url",

                "image_url": {

                    "url":
                        (
                            f"data:{tipo_imagem};"
                            f"base64,{imagem_base64}"
                        )

                }

            })

        if client is None:

            raise RuntimeError(
                "GROQ_API_KEY não configurada."
            )

        mensagens_para_api = list(
            mensagens_ia
        )

        mensagens_para_api.append({

            "role":
                "user",

            "content":
                conteudo_usuario

        })

        @stream_with_context
        def gerar_stream():

            texto_completo = ""
            ultimo_erro = None
            resposta_comecou = False

            for tentativa in range(1, 4):

                try:

                    print(
                        f"INICIANDO STREAMING - "
                        f"TENTATIVA {tentativa}/3"
                    )

                    stream = (
                        client.chat.completions.create(

                            model=
                                "qwen/qwen3.6-27b",

                            messages=
                                mensagens_para_api,

                            temperature=
                                0.7,

                            max_completion_tokens=
                                1024,

                            reasoning_effort=
                                "none",

                            stream=
                                True

                        )
                    )

                    for chunk in stream:

                        if not chunk.choices:

                            continue

                        delta = (
                            chunk.choices[0].delta
                        )

                        parte = (
                            delta.content
                            or ""
                        )

                        if not parte:

                            continue

                        resposta_comecou = True

                        texto_completo += parte

                        yield parte

                    if texto_completo.strip():

                        break

                except Exception as e:

                    ultimo_erro = e

                    print(
                        "ERRO STREAMING:",
                        repr(e)
                    )

                    erro_texto = str(
                        e
                    ).lower()

                    if (
                        "429" in erro_texto
                        or "rate limit" in erro_texto
                    ):

                        if resposta_comecou:

                            return

                        retry_after = None

                        response_obj = getattr(
                            e,
                            "response",
                            None
                        )

                        if response_obj is not None:

                            headers = getattr(
                                response_obj,
                                "headers",
                                {}
                            ) or {}

                            retry_after = (
                                headers.get(
                                    "retry-after"
                                )
                                or headers.get(
                                    "Retry-After"
                                )
                            )

                        espera = None

                        if retry_after:

                            try:

                                espera = float(
                                    str(
                                        retry_after
                                    ).strip()
                                )

                            except (
                                ValueError,
                                TypeError
                            ):

                                espera = None

                        if espera is None:

                            espera = (
                                tentativa * 3
                            )

                        espera = max(
                            1,
                            min(
                                espera,
                                15
                            )
                        )

                        if tentativa < 3:

                            print(
                                f"RATE LIMIT. "
                                f"AGUARDANDO {espera:.1f} SEGUNDOS..."
                            )

                            time.sleep(
                                espera
                            )

                            continue

                        yield (
                            "\n\nA Groq está "
                            "temporariamente no limite. "
                            "Tente novamente em alguns segundos."
                        )

                        return

                    if "api key" in erro_texto:

                        yield (
                            "\n\nA GROQ_API_KEY "
                            "não está configurada corretamente."
                        )

                        return

                    if (
                        "model" in erro_texto
                        and (
                            "not found"
                            in erro_texto
                            or "model_not_found"
                            in erro_texto
                        )
                    ):

                        yield (
                            "\n\nO modelo da IA "
                            "não está disponível para esta chave da Groq."
                        )

                        return

                    if (
                        "database" in erro_texto
                        or "postgres" in erro_texto
                        or "psycopg2" in erro_texto
                    ):

                        yield (
                            "\n\nErro ao acessar "
                            "o banco de dados PostgreSQL."
                        )

                        return

                    yield (
                        "\n\nOcorreu um erro "
                        "ao gerar a resposta."
                    )

                    return

            if not texto_completo.strip():

                if ultimo_erro:

                    print(
                        "STREAMING FINALIZADO SEM RESPOSTA:",
                        repr(ultimo_erro)
                    )

                texto_completo = (
                    "Não consegui gerar uma resposta."
                )

                yield texto_completo

            try:

                with get_db() as conn:

                    cursor = conn.cursor()

                    cursor.execute("""
                        INSERT INTO chat_messages
                        (conversation_id, sender, message)
                        VALUES (%s, %s, %s)
                    """, (
                        conversation_id,
                        "bot",
                        texto_completo
                    ))

                    cursor.execute("""
                        UPDATE conversations
                        SET updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (
                        conversation_id,
                    ))

                    conn.commit()

                print(
                    "STREAMING FINALIZADO:",
                    conversation_id
                )

            except Exception as erro_db:

                print(
                    "ERRO AO SALVAR RESPOSTA DO STREAMING:",
                    repr(erro_db)
                )

        return Response(

            gerar_stream(),

            mimetype="text/plain",

            headers={

                "Cache-Control":
                    "no-cache, no-transform",

                "X-Accel-Buffering":
                    "no",

                "Connection":
                    "keep-alive",

                "X-Content-Type-Options":
                    "nosniff"

            }

        )

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO NO CHAT:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        if (
            mensagem_id is not None
            and conversation_id is not None
        ):

            try:

                with get_db() as conn:

                    cursor = conn.cursor()

                    cursor.execute("""
                        DELETE FROM chat_messages
                        WHERE id = %s
                        AND conversation_id = %s
                        AND sender = 'user'
                    """, (
                        mensagem_id,
                        conversation_id
                    ))

                    conn.commit()

            except Exception as erro_db:

                print(
                    "ERRO AO REVERTER MENSAGEM:",
                    repr(erro_db)
                )

        mensagem_erro = (
            "Ocorreu um erro ao processar sua mensagem."
        )

        texto_erro = str(
            e
        ).lower()

        if "api key" in texto_erro:

            mensagem_erro = (
                "A GROQ_API_KEY não está configurada corretamente no Render."
            )

        elif (
            "model" in texto_erro
            and (
                "not found" in texto_erro
                or "model_not_found" in texto_erro
            )
        ):

            mensagem_erro = (
                "O modelo da IA não está disponível para esta chave da Groq."
            )

        elif (
            "rate limit" in texto_erro
            or "429" in texto_erro
        ):

            mensagem_erro = (
                "A Groq está temporariamente no limite. "
                "Tente novamente em alguns segundos."
            )

        elif (
            "database" in texto_erro
            or "postgres" in texto_erro
            or "psycopg2" in texto_erro
        ):

            mensagem_erro = (
                "Erro ao acessar o banco de dados PostgreSQL."
            )

        return jsonify({

            "success":
                False,

            "reply":
                mensagem_erro,

            "message":
                mensagem_erro

        }), 500


# ============================================================
# LISTAR CONVERSAS
# ============================================================

@app.route("/conversations")
def conversations():

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro.",

            "conversations":
                []

        }), 401

    try:

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    id,
                    title,
                    created_at,
                    updated_at
                FROM conversations
                WHERE username = %s
                ORDER BY updated_at DESC, id DESC
            """, (
                session["user"],
            ))

            lista = cursor.fetchall()

        return jsonify([

            {

                "id":
                    item["id"],

                "title":
                    item["title"]
                    or "Nova conversa",

                "created_at":
                    (
                        item["created_at"].isoformat()
                        if item["created_at"]
                        else None
                    ),

                "updated_at":
                    (
                        item["updated_at"].isoformat()
                        if item["updated_at"]
                        else None
                    )

            }

            for item in lista

        ])

    except Exception as e:

        print(
            "ERRO CONVERSATIONS:",
            repr(e)
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao carregar conversas.",

            "conversations":
                []

        }), 500


# ============================================================
# ALIAS API - CONVERSAS
# ============================================================

@app.route("/api/conversations")
def api_conversations():

    return conversations()


# ============================================================
# ABRIR CONVERSA
# ============================================================

@app.route(
    "/conversation/<int:conversation_id>"
)
def open_conversation(
    conversation_id
):

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro."

        }), 401

    try:

        if not verificar_conversa(
            session["user"],
            conversation_id
        ):

            return jsonify({

                "success":
                    False,

                "message":
                    "Conversa não encontrada."

            }), 404

        session["conversation_id"] = (
            conversation_id
        )

        session.modified = True

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    sender,
                    message,
                    created_at
                FROM chat_messages
                WHERE conversation_id = %s
                ORDER BY id ASC
            """, (
                conversation_id,
            ))

            mensagens = cursor.fetchall()

            cursor.execute("""
                SELECT
                    title,
                    created_at,
                    updated_at
                FROM conversations
                WHERE id = %s
                AND username = %s
            """, (
                conversation_id,
                session["user"]
            ))

            conversa = cursor.fetchone()

        return jsonify({

            "success":
                True,

            "conversation_id":
                conversation_id,

            "title":
                (
                    conversa["title"]
                    if conversa
                    else "Nova conversa"
                ),

            "created_at":
                (
                    conversa["created_at"].isoformat()
                    if (
                        conversa
                        and conversa["created_at"]
                    )
                    else None
                ),

            "updated_at":
                (
                    conversa["updated_at"].isoformat()
                    if (
                        conversa
                        and conversa["updated_at"]
                    )
                    else None
                ),

            "messages": [

                {

                    "sender":
                        item["sender"],

                    "message":
                        item["message"],

                    "created_at":
                        (
                            item["created_at"].isoformat()
                            if item["created_at"]
                            else None
                        )

                }

                for item in mensagens

            ]

        })

    except Exception as e:

        print(
            "ERRO OPEN CONVERSATION:",
            repr(e)
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao abrir a conversa."

        }), 500


# ============================================================
# ALIAS API - ABRIR CONVERSA
# ============================================================

@app.route(
    "/api/conversation/<int:conversation_id>"
)
def api_open_conversation(
    conversation_id
):

    return open_conversation(
        conversation_id
    )


# ============================================================
# HISTORY
# ============================================================

@app.route("/history")
def history():

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro.",

            "history":
                []

        }), 401

    try:

        conversation_id = (
            conversa_atual()
        )

        if not conversation_id:

            return jsonify([])

        with get_db() as conn:

            cursor = conn.cursor(
                cursor_factory=
                psycopg2.extras.RealDictCursor
            )

            cursor.execute("""
                SELECT
                    sender,
                    message,
                    created_at
                FROM chat_messages
                WHERE conversation_id = %s
                ORDER BY id ASC
            """, (
                conversation_id,
            ))

            mensagens = cursor.fetchall()

        return jsonify([

            {

                "sender":
                    item["sender"],

                "message":
                    item["message"],

                "created_at":
                    (
                        item["created_at"].isoformat()
                        if item["created_at"]
                        else None
                    )

            }

            for item in mensagens

        ])

    except Exception as e:

        print(
            "ERRO HISTORY:",
            repr(e)
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao carregar histórico.",

            "history":
                []

        }), 500


# ============================================================
# ALIAS API - HISTORY
# ============================================================

@app.route("/api/history")
def api_history():

    return history()


# ============================================================
# NOVA CONVERSA
# ============================================================

@app.route(
    "/new_chat",
    methods=["POST"]
)
def new_chat():

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro."

        }), 401

    try:

        username = session["user"]

        conversation_id = criar_conversa(
            username,
            "Nova conversa"
        )

        session["conversation_id"] = (
            conversation_id
        )

        session.modified = True

        print(
            f"Nova conversa criada: "
            f"{conversation_id} - {username}"
        )

        return jsonify({

            "success":
                True,

            "conversation_id":
                conversation_id,

            "title":
                "Nova conversa"

        })

    except Exception as e:

        print(
            "ERRO NEW CHAT:",
            repr(e)
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao criar uma nova conversa."

        }), 500


# ============================================================
# ALIAS API - NOVA CONVERSA
# ============================================================

@app.route(
    "/api/new_chat",
    methods=["POST"]
)
def api_new_chat():

    return new_chat()


# ============================================================
# RENOMEAR CONVERSA
# ============================================================

@app.route(
    "/conversation/<int:conversation_id>/rename",
    methods=["POST"]
)
def rename_conversation(
    conversation_id
):

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro."

        }), 401

    try:

        if not verificar_conversa(
            session["user"],
            conversation_id
        ):

            return jsonify({

                "success":
                    False,

                "message":
                    "Conversa não encontrada."

            }), 404

        data = request.get_json(
            silent=True
        ) or {}

        title = str(
            data.get("title") or ""
        ).strip()

        if not title:

            return jsonify({

                "success":
                    False,

                "message":
                    "Digite um nome para a conversa."

            }), 400

        if len(title) > 100:

            title = title[:100].rstrip()

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                UPDATE conversations
                SET title = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                AND username = %s
            """, (
                title,
                conversation_id,
                session["user"]
            ))

            conn.commit()

        return jsonify({

            "success":
                True,

            "title":
                title

        })

    except Exception as e:

        print(
            "ERRO RENAME:",
            repr(e)
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao renomear conversa."

        }), 500


# ============================================================
# ALIAS API - RENOMEAR
# ============================================================

@app.route(
    "/api/conversation/<int:conversation_id>/rename",
    methods=["POST"]
)
def api_rename_conversation(
    conversation_id
):

    return rename_conversation(
        conversation_id
    )


# ============================================================
# FUNÇÃO INTERNA - EXCLUIR CONVERSA
# ============================================================

def executar_exclusao_conversa(
    conversation_id
):

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro."

        }), 401

    try:

        username = session["user"]

        try:

            conversation_id = int(
                conversation_id
            )

        except (
            ValueError,
            TypeError
        ):

            return jsonify({

                "success":
                    False,

                "message":
                    "ID da conversa inválido."

            }), 400

        if not verificar_conversa(
            username,
            conversation_id
        ):

            return jsonify({

                "success":
                    False,

                "message":
                    "Conversa não encontrada."

            }), 404

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                DELETE FROM chat_messages
                WHERE conversation_id = %s
            """, (
                conversation_id,
            ))

            cursor.execute("""
                DELETE FROM conversations
                WHERE id = %s
                AND username = %s
            """, (
                conversation_id,
                username
            ))

            excluida = cursor.rowcount

            if excluida == 0:

                conn.rollback()

                return jsonify({

                    "success":
                        False,

                    "message":
                        "Conversa não encontrada."

                }), 404

            conn.commit()

        conversa_atual_id = (
            session.get(
                "conversation_id"
            )
        )

        if (
            conversa_atual_id is not None
            and int(conversa_atual_id)
            == int(conversation_id)
        ):

            nova_conversa = criar_conversa(
                username,
                "Nova conversa"
            )

            session["conversation_id"] = (
                nova_conversa
            )

            session.modified = True

        else:

            atual = session.get(
                "conversation_id"
            )

            if atual:

                try:

                    atual_existe = (
                        verificar_conversa(
                            username,
                            atual
                        )
                    )

                except Exception:

                    atual_existe = False

                if not atual_existe:

                    nova_conversa = (
                        criar_conversa(
                            username,
                            "Nova conversa"
                        )
                    )

                    session["conversation_id"] = (
                        nova_conversa
                    )

                    session.modified = True

            else:

                nova_conversa = (
                    criar_conversa(
                        username,
                        "Nova conversa"
                    )
                )

                session["conversation_id"] = (
                    nova_conversa
                )

                session.modified = True

        print(
            "CONVERSA EXCLUÍDA:",
            conversation_id,
            "USUÁRIO:",
            username
        )

        return jsonify({

            "success":
                True,

            "message":
                "Conversa excluída com sucesso.",

            "deleted_id":
                int(conversation_id),

            "conversation_id":
                session.get(
                    "conversation_id"
                )

        })

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO DELETE CONVERSATION:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro interno ao excluir conversa.",

            "error":
                str(e)

        }), 500


# ============================================================
# EXCLUIR UMA CONVERSA
# ============================================================

@app.route(
    "/conversation/<int:conversation_id>",
    methods=["DELETE"]
)
def delete_conversation(
    conversation_id
):

    return executar_exclusao_conversa(
        conversation_id
    )


# ============================================================
# DELETE LEGACY
# ============================================================

@app.route(
    "/delete_conversation",
    methods=["POST"]
)
def delete_conversation_legacy():

    data = request.get_json(
        silent=True
    ) or {}

    conversation_id = (
        data.get("conversation_id")
        or data.get("id")
    )

    if not conversation_id:

        return jsonify({

            "success":
                False,

            "message":
                "ID da conversa não informado."

        }), 400

    return executar_exclusao_conversa(
        conversation_id
    )


# ============================================================
# ALIAS API DELETE
# ============================================================

@app.route(
    "/api/conversation/<int:conversation_id>",
    methods=["DELETE"]
)
def api_delete_conversation(
    conversation_id
):

    return executar_exclusao_conversa(
        conversation_id
    )


# ============================================================
# ALIAS /delete
# ============================================================

@app.route(
    "/conversation/<int:conversation_id>/delete",
    methods=["DELETE", "POST"]
)
def delete_conversation_with_delete(
    conversation_id
):

    return executar_exclusao_conversa(
        conversation_id
    )


# ============================================================
# ALIAS API /delete
# ============================================================

@app.route(
    "/api/conversation/<int:conversation_id>/delete",
    methods=["DELETE", "POST"]
)
def api_delete_conversation_with_delete(
    conversation_id
):

    return executar_exclusao_conversa(
        conversation_id
    )


# ============================================================
# FUNÇÃO INTERNA - EXCLUIR VÁRIAS
# ============================================================

def executar_exclusao_varias_conversas(
    ids
):

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro."

        }), 401

    try:

        if not isinstance(
            ids,
            list
        ):

            return jsonify({

                "success":
                    False,

                "message":
                    "Lista de conversas inválida."

            }), 400

        if not ids:

            return jsonify({

                "success":
                    False,

                "message":
                    "Nenhuma conversa foi selecionada."

            }), 400

        conversation_ids = []

        for item in ids:

            try:

                conversation_id = int(
                    item
                )

            except (
                ValueError,
                TypeError
            ):

                continue

            if conversation_id > 0:

                conversation_ids.append(
                    conversation_id
                )

        conversation_ids = list(
            dict.fromkeys(
                conversation_ids
            )
        )

        if not conversation_ids:

            return jsonify({

                "success":
                    False,

                "message":
                    "Nenhuma conversa válida foi selecionada."

            }), 400

        username = session["user"]

        conversa_atual_id = (
            session.get(
                "conversation_id"
            )
        )

        with get_db() as conn:

            cursor = conn.cursor()

            cursor.execute("""
                SELECT id
                FROM conversations
                WHERE username = %s
                AND id = ANY(%s)
            """, (
                username,
                conversation_ids
            ))

            conversas_validas = (
                cursor.fetchall()
            )

            ids_validos = [

                item[0]

                for item in conversas_validas

            ]

            if not ids_validos:

                conn.rollback()

                return jsonify({

                    "success":
                        False,

                    "message":
                        "Nenhuma das conversas selecionadas pertence ao usuário."

                }), 404

            cursor.execute("""
                DELETE FROM chat_messages
                WHERE conversation_id = ANY(%s)
            """, (
                ids_validos,
            ))

            cursor.execute("""
                DELETE FROM conversations
                WHERE username = %s
                AND id = ANY(%s)
                RETURNING id
            """, (
                username,
                ids_validos
            ))

            excluidas = cursor.fetchall()

            conn.commit()

        ids_excluidos = [

            int(item[0])

            for item in excluidas

        ]

        conversa_atual_excluida = (

            conversa_atual_id is not None

            and int(conversa_atual_id)
            in ids_excluidos

        )

        if conversa_atual_excluida:

            nova_conversa = criar_conversa(
                username,
                "Nova conversa"
            )

            session["conversation_id"] = (
                nova_conversa
            )

            session.modified = True

        else:

            atual = session.get(
                "conversation_id"
            )

            if atual:

                try:

                    atual_existe = (
                        verificar_conversa(
                            username,
                            atual
                        )
                    )

                except Exception:

                    atual_existe = False

                if not atual_existe:

                    nova_conversa = (
                        criar_conversa(
                            username,
                            "Nova conversa"
                        )
                    )

                    session["conversation_id"] = (
                        nova_conversa
                    )

                    session.modified = True

            else:

                nova_conversa = (
                    criar_conversa(
                        username,
                        "Nova conversa"
                    )
                )

                session["conversation_id"] = (
                    nova_conversa
                )

                session.modified = True

        print(
            "CONVERSAS EXCLUÍDAS:",
            ids_excluidos,
            "USUÁRIO:",
            username
        )

        return jsonify({

            "success":
                True,

            "message":
                (
                    f"{len(ids_excluidos)} "
                    "conversa(s) excluída(s) permanentemente."
                ),

            "deleted_ids":
                ids_excluidos,

            "deleted_count":
                len(ids_excluidos),

            "conversation_id":
                session.get(
                    "conversation_id"
                )

        })

    except Exception as e:

        print(
            "=================================================="
        )

        print(
            "ERRO DELETE MULTIPLE CONVERSATIONS:"
        )

        print(
            repr(e)
        )

        print(
            "=================================================="
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao excluir as conversas.",

            "error":
                str(e)

        }), 500


# ============================================================
# EXCLUIR VÁRIAS - PRINCIPAL
# ============================================================

@app.route(
    "/conversations/delete-multiple",
    methods=["POST"]
)
def delete_multiple_conversations():

    data = request.get_json(
        silent=True
    ) or {}

    ids = (

        data.get("ids")

        if data.get("ids") is not None

        else data.get(
            "conversation_ids"
        )

    )

    return executar_exclusao_varias_conversas(
        ids
    )


# ============================================================
# EXCLUIR VÁRIAS - LEGACY
# ============================================================

@app.route(
    "/delete_conversations",
    methods=["POST"]
)
def delete_conversations_legacy():

    data = request.get_json(
        silent=True
    ) or {}

    ids = (

        data.get(
            "conversation_ids"
        )

        if data.get(
            "conversation_ids"
        ) is not None

        else data.get("ids")

    )

    return executar_exclusao_varias_conversas(
        ids
    )


# ============================================================
# API VÁRIAS
# ============================================================

@app.route(
    "/api/conversations/delete-multiple",
    methods=["POST"]
)
def api_delete_multiple_conversations():

    data = request.get_json(
        silent=True
    ) or {}

    ids = (

        data.get("ids")

        if data.get("ids") is not None

        else data.get(
            "conversation_ids"
        )

    )

    return executar_exclusao_varias_conversas(
        ids
    )


# ============================================================
# PLANO
# ============================================================

@app.route("/api/plan")
def api_plan():

    if "user" not in session:

        return jsonify({

            "success":
                False,

            "message":
                "Faça login primeiro."

        }), 401

    try:

        plan = obter_plan_usuario(
            session["user"]
        )

        session["plan"] = plan

        return jsonify({

            "success":
                True,

            "plan":
                plan

        })

    except Exception as e:

        print(
            "ERRO PLAN:",
            repr(e)
        )

        return jsonify({

            "success":
                False,

            "message":
                "Erro ao consultar plano."

        }), 500


# ============================================================
# STATUS
# ============================================================

@app.route("/api/status")
def api_status():

    if "user" not in session:

        return jsonify({

            "logged":
                False

        })

    try:

        return jsonify({

            "logged":
                True,

            "username":
                session["user"],

            "plan":
                obter_plan_usuario(
                    session["user"]
                ),

            "conversation_id":
                session.get(
                    "conversation_id"
                ),

            "admin":
                verificar_admin()

        })

    except Exception as e:

        print(
            "ERRO STATUS:",
            repr(e)
        )

        return jsonify({

            "logged":
                True,

            "username":
                session["user"],

            "plan":
                "free",

            "conversation_id":
                session.get(
                    "conversation_id"
                ),

            "admin":
                verificar_admin()

        })


# ============================================================
# TRATAMENTO 404
# ============================================================

@app.errorhandler(404)
def erro_404(error):

    print(
        "ROTA 404:",
        request.method,
        request.path
    )

    return jsonify({

        "success":
            False,

        "error":
            "not_found",

        "message":
            "Rota não encontrada.",

        "path":
            request.path

    }), 404


# ============================================================
# TRATAMENTO 500
# ============================================================

@app.errorhandler(500)
def erro_500(error):

    print(
        "ERRO 500 GLOBAL:",
        repr(error)
    )

    return jsonify({

        "success":
            False,

        "error":
            "internal_server_error",

        "message":
            "Erro interno no servidor."

    }), 500


# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            5000
        )
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
