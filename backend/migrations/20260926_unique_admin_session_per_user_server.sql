-- Invariante de una sola sesion administrativa activa por
-- usuario y servidor.
--
-- Contexto
--
-- admin_sessions solo tenia PRIMARY KEY (id) y UNIQUE (token).
-- Eso permitia que dos altas concurrentes de la misma
-- combinacion (user_id, server_id) terminaran con dos filas
-- vivas: la segunda transaccion no veia la fila que la primera
-- iba a insertar, de modo que su DELETE no eliminaba nada y su
-- INSERT anadia la suya. La politica se cumplia de forma
-- secuencial y se incumplia bajo concurrencia.
--
-- Esta migracion convierte la politica en una invariante de
-- PostgreSQL, de modo que deja de depender del orden de las
-- sentencias.
--
-- Execution
--
--   psql -v ON_ERROR_STOP=1 -f <este archivo>
--
-- Debe aplicarse sobre una copia verificada de los datos, no
-- sobre produccion sin antes hacer un respaldo y revisar las
-- filas que la limpieza va a eliminar.
--
-- Decision de diseno
--
-- La limpieza conserva la fila mas reciente de cada
-- combinacion, ordenada por created_at DESC, id DESC. El id
-- como segundo criterio hace la eleccion determinista cuando
-- varias filas comparten created_at, y evita depender de un
-- identificador de orden de insercion que la columna created_at
-- no garantiza.
--
-- Nota importante sobre idempotencia
--
-- El archivo NO es idempotente a proposito. Si la restriccion ya
-- existe, ALTER TABLE falla y, con ON_ERROR_STOP=1, el
-- script se detiene. Una cláusula condicional silenciosa
-- convertiria un esquema inesperado en un exito aparente,
-- que es precisamente el fallo que conviene detectar.

BEGIN;

-- Elimina los duplicados conservando la fila mas reciente de
-- cada combinacion user_id + server_id. Solo se borran las
-- filas con row_number > 1, es decir, nunca la mas reciente.
--
-- No toca users, ni servers, ni tokens, ni expires_at, ni
-- created_at. No borra la tabla de forma masiva, no reinicia
-- secuencias y no usa la opcion de borrado en cascada.

DELETE FROM admin_sessions
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY user_id, server_id
                ORDER BY created_at DESC, id DESC
            ) AS fila
        FROM admin_sessions
    ) AS numeradas
    WHERE numeradas.fila > 1
);

ALTER TABLE admin_sessions
ADD CONSTRAINT admin_sessions_user_server_key
UNIQUE (
    user_id,
    server_id
);

COMMIT;
