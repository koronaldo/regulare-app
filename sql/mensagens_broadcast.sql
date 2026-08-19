-- Mensagens de broadcast do servidor para os dispositivos (app mobile), lidas via polling
-- (ver backgroundSync.ts e app/mensagens.tsx). Rodar direto no Postgres da produção — não é
-- executado automaticamente pelo app nem pelo Claude, os endpoints em mobile-auth-v2/ só leem
-- e gravam nessas tabelas depois que elas já existirem.

create table if not exists mensagem_broadcast (
    id_mensagem     serial primary key,
    titulo          varchar(120) not null,
    corpo           text not null,
    id_reguladora   integer,              -- null = todas as reguladoras
    id_regulador    integer,              -- null = todos os usuários da reguladora (ou de todas, se id_reguladora também for null)
    ativa           boolean not null default true,
    data_criacao    timestamp not null default now(),
    id_usuario_cad  integer               -- quem cadastrou (auditoria, opcional)
);

comment on table mensagem_broadcast is 'Mensagens cadastradas no servidor para os dispositivos buscarem via polling.';
comment on column mensagem_broadcast.id_reguladora is 'Filtro por empresa/reguladora; NULL = todas.';
comment on column mensagem_broadcast.id_regulador is 'Filtro por usuário (pessoa) específico; NULL = todos os usuários que passarem no filtro de id_reguladora.';

-- Log por usuário: quando a mensagem foi entregue (o app buscou) e quando foi lida (o usuário
-- abriu). Uma linha só existe depois que pelo menos um desses dois eventos aconteceu.
create table if not exists mensagem_destino (
    id_mensagem     integer not null references mensagem_broadcast(id_mensagem),
    id_regulador    integer not null,
    entregue        boolean not null default false,
    data_entrega    timestamp,
    lida            boolean not null default false,
    data_leitura    timestamp,
    primary key (id_mensagem, id_regulador)
);

comment on table mensagem_destino is 'Log de entrega/leitura de cada mensagem por usuário (regulador).';

create index if not exists idx_mensagem_destino_regulador on mensagem_destino(id_regulador);

-- Exemplo de cadastro de uma mensagem para TODOS os usuários de TODAS as reguladoras:
-- insert into mensagem_broadcast (titulo, corpo) values ('Manutenção programada', 'O sistema ficará indisponível das 22h às 23h de hoje.');

-- Exemplo só para uma reguladora específica:
-- insert into mensagem_broadcast (titulo, corpo, id_reguladora) values ('Aviso', 'Texto...', 123);

-- Exemplo só para um usuário específico:
-- insert into mensagem_broadcast (titulo, corpo, id_reguladora, id_regulador) values ('Aviso pessoal', 'Texto...', 123, 456);
