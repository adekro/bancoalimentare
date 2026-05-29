-- ============================================================
-- Gestionale Solidale: Banco Alimentare
-- Schema Supabase — generato il 2026-04-18
--
-- Utente admin: e.croce88@gmail.com
--
-- Istruzioni:
--   1. Apri Supabase Dashboard → SQL Editor
--   2. Incolla e lancia questo script
--   3. Crea manualmente l'utente e.croce88@gmail.com in
--      Authentication → Users (o invite by email)
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================
DO $$ BEGIN
    CREATE TYPE stato_nucleo      AS ENUM ('bozza', 'verde', 'nero', 'rosso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migrazione: aggiunge 'bozza' a stato_nucleo se non presente (per database esistenti)
DO $$ BEGIN
    ALTER TYPE stato_nucleo ADD VALUE IF NOT EXISTS 'bozza' BEFORE 'verde';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ruolo_componente  AS ENUM ('capofamiglia', 'titolare', 'componente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE fondo_ministeriale AS ENUM ('FSE+', 'nazionale', 'cofinanziato');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE tipo_movimento    AS ENUM ('carico', 'scarico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE stato_richiesta   AS ENUM ('in_attesa', 'approvata', 'rifiutata');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE zona_distribuzione AS ENUM ('Pombio', 'Duomo', 'Medassino', 'San Rocco');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE fascia_eta        AS ENUM ('0-17', '18-29', '30-64', '65+');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- Richieste di accesso (compilate da nuovi operatori non ancora approvati)
CREATE TABLE IF NOT EXISTS public.access_requests (
    id         UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome       TEXT            NOT NULL,
    email      TEXT            NOT NULL,
    centro     TEXT,
    stato      stato_richiesta NOT NULL DEFAULT 'in_attesa',
    created_at TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Nuclei familiari
CREATE TABLE IF NOT EXISTS public.nuclei (
    id              UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_nucleo_familiare TEXT,
    codice_fiscale  TEXT               UNIQUE,
    telefono        TEXT,
    indirizzo       TEXT,
    zona            zona_distribuzione NOT NULL,
    stato           stato_nucleo       NOT NULL DEFAULT 'verde',
    archiviato      BOOLEAN            NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Componenti del nucleo
CREATE TABLE IF NOT EXISTS public.componenti (
    id           UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    nucleo_id    UUID               NOT NULL REFERENCES public.nuclei(id) ON DELETE CASCADE,
    ruolo        ruolo_componente   NOT NULL,
    nome         TEXT               NOT NULL,
    cognome      TEXT               NOT NULL,
    codice_fiscale TEXT,
    data_nascita DATE,
    nazionalita  TEXT,
    nazione_nascita TEXT,
    sesso        TEXT CHECK (sesso IN ('M', 'F')),
    paesi_terzi_ue BOOLEAN          NOT NULL DEFAULT FALSE,
    invalido     BOOLEAN            NOT NULL DEFAULT FALSE,
    fascia_eta   fascia_eta,                    -- calcolata automaticamente da data_nascita
    created_at   TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Allinea schema su database gia esistenti
ALTER TABLE public.nuclei ADD COLUMN IF NOT EXISTS numero_nucleo_familiare TEXT;
ALTER TABLE public.nuclei ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.nuclei ADD COLUMN IF NOT EXISTS indirizzo TEXT;

ALTER TABLE public.componenti ADD COLUMN IF NOT EXISTS sesso TEXT;
ALTER TABLE public.componenti ADD COLUMN IF NOT EXISTS paesi_terzi_ue BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.componenti ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE public.componenti ADD COLUMN IF NOT EXISTS nazione_nascita TEXT;
ALTER TABLE public.componenti ADD COLUMN IF NOT EXISTS invalido BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
    ALTER TABLE public.componenti
    ADD CONSTRAINT componenti_sesso_check CHECK (sesso IN ('M', 'F'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storico iscrizioni / tessere (un record per ogni periodo di iscrizione)
CREATE TABLE IF NOT EXISTS public.iscrizioni (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    nucleo_id        UUID        NOT NULL REFERENCES public.nuclei(id) ON DELETE CASCADE,
    numero_tessera   TEXT        NOT NULL,
    data_inizio      DATE,
    data_scadenza    DATE,
    note             TEXT,
    operatore_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrazione dati da tessere (se la tabella esiste ancora)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tessere') THEN
        -- Riga per scadenza_vecchia (iscrizione precedente)
        INSERT INTO public.iscrizioni (nucleo_id, numero_tessera, data_scadenza, created_at)
        SELECT nucleo_id, numero, scadenza_vecchia,
               created_at - INTERVAL '1 second'
        FROM public.tessere
        WHERE scadenza_vecchia IS NOT NULL
        ON CONFLICT DO NOTHING;
        -- Riga per scadenza_nuova (iscrizione corrente)
        INSERT INTO public.iscrizioni (nucleo_id, numero_tessera, data_scadenza, created_at)
        SELECT nucleo_id, numero, scadenza_nuova, created_at
        FROM public.tessere
        WHERE scadenza_nuova IS NOT NULL
        ON CONFLICT DO NOTHING;
        -- Nuclei con tessera ma senza date: solo numero
        INSERT INTO public.iscrizioni (nucleo_id, numero_tessera, created_at)
        SELECT nucleo_id, numero, created_at
        FROM public.tessere
        WHERE scadenza_vecchia IS NULL AND scadenza_nuova IS NULL
        ON CONFLICT DO NOTHING;
        DROP TABLE public.tessere;
    END IF;
END $$;

-- Distribuzioni effettuate
CREATE TABLE IF NOT EXISTS public.distribuzioni (
    id           UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    nucleo_id    UUID               NOT NULL REFERENCES public.nuclei(id) ON DELETE RESTRICT,
    centro       zona_distribuzione NOT NULL,
    data         DATE               NOT NULL DEFAULT CURRENT_DATE,
    operatore_id UUID               REFERENCES auth.users(id) ON DELETE SET NULL,
    note         TEXT,
    created_at   TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Articoli del magazzino
CREATE TABLE IF NOT EXISTS public.articoli (
    id            UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome          TEXT               NOT NULL,
    unita_misura  TEXT               NOT NULL,
    fondo         fondo_ministeriale NOT NULL,
    created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Movimenti di magazzino (carico / scarico)
CREATE TABLE IF NOT EXISTS public.movimenti_magazzino (
    id            UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    articolo_id   UUID            NOT NULL REFERENCES public.articoli(id) ON DELETE RESTRICT,
    tipo          tipo_movimento  NOT NULL,
    quantita_pezzi INTEGER        NOT NULL CHECK (quantita_pezzi > 0),
    data          DATE            NOT NULL DEFAULT CURRENT_DATE,
    riferimento   TEXT,                          -- es. numero bolla
    operatore_id  UUID            REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_nuclei_zona           ON public.nuclei(zona);
CREATE INDEX IF NOT EXISTS idx_nuclei_stato          ON public.nuclei(stato);
CREATE INDEX IF NOT EXISTS idx_nuclei_codice_fiscale ON public.nuclei(codice_fiscale);
CREATE INDEX IF NOT EXISTS idx_nuclei_archiviato     ON public.nuclei(archiviato);

CREATE INDEX IF NOT EXISTS idx_componenti_nucleo     ON public.componenti(nucleo_id);
CREATE INDEX IF NOT EXISTS idx_componenti_cognome    ON public.componenti(cognome);
CREATE INDEX IF NOT EXISTS idx_componenti_codice_fiscale ON public.componenti(codice_fiscale);

CREATE INDEX IF NOT EXISTS idx_iscrizioni_nucleo       ON public.iscrizioni(nucleo_id);
CREATE INDEX IF NOT EXISTS idx_iscrizioni_data_scad    ON public.iscrizioni(data_scadenza);
CREATE INDEX IF NOT EXISTS idx_iscrizioni_numero       ON public.iscrizioni(numero_tessera);

CREATE INDEX IF NOT EXISTS idx_distribuzioni_nucleo  ON public.distribuzioni(nucleo_id);
CREATE INDEX IF NOT EXISTS idx_distribuzioni_data    ON public.distribuzioni(data);
CREATE INDEX IF NOT EXISTS idx_distribuzioni_centro  ON public.distribuzioni(centro);
CREATE INDEX IF NOT EXISTS idx_distribuzioni_nucleo_data ON public.distribuzioni(nucleo_id, data);

CREATE INDEX IF NOT EXISTS idx_movimenti_articolo    ON public.movimenti_magazzino(articolo_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_data        ON public.movimenti_magazzino(data);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Aggiorna updated_at automaticamente
CREATE OR REPLACE FUNCTION public.fn_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nuclei_updated_at ON public.nuclei;
CREATE TRIGGER trg_nuclei_updated_at
    BEFORE UPDATE ON public.nuclei
    FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at();

-- Calcola fascia_eta da data_nascita
CREATE OR REPLACE FUNCTION public.fn_compute_fascia_eta(p_data_nascita DATE)
RETURNS fascia_eta LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_eta INTEGER;
BEGIN
    v_eta := DATE_PART('year', AGE(p_data_nascita))::INTEGER;
    IF    v_eta <= 17 THEN RETURN '0-17';
    ELSIF v_eta <= 29 THEN RETURN '18-29';
    ELSIF v_eta <= 64 THEN RETURN '30-64';
    ELSE                   RETURN '65+';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_fascia_eta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.data_nascita IS NOT NULL THEN
        NEW.fascia_eta = public.fn_compute_fascia_eta(NEW.data_nascita);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_componenti_fascia_eta ON public.componenti;
CREATE TRIGGER trg_componenti_fascia_eta
    BEFORE INSERT OR UPDATE OF data_nascita ON public.componenti
    FOR EACH ROW EXECUTE FUNCTION public.fn_auto_fascia_eta();

-- Rinnovo massivo annuale: resetta lo stato di tutti i nuclei attivi a 'verde'
-- Eseguire come job Supabase Cron il 1° gennaio
CREATE OR REPLACE FUNCTION public.fn_rinnovo_massivo_annuale()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.nuclei
    SET    stato      = 'verde',
           updated_at = NOW()
    WHERE  archiviato = FALSE;
END;
$$;

-- Blocco doppio ritiro nella stessa settimana ISO (lun-dom)
CREATE OR REPLACE FUNCTION public.fn_distribuzioni_no_doppio_ritiro_settimanale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_start_settimana DATE;
    v_end_settimana   DATE;
BEGIN
    v_start_settimana := NEW.data - ((EXTRACT(ISODOW FROM NEW.data)::INT) - 1);
    v_end_settimana   := v_start_settimana + 6;

    IF EXISTS (
        SELECT 1
        FROM public.distribuzioni d
        WHERE d.nucleo_id = NEW.nucleo_id
          AND d.data BETWEEN v_start_settimana AND v_end_settimana
          AND (TG_OP = 'INSERT' OR d.id <> NEW.id)
    ) THEN
        RAISE EXCEPTION 'Nucleo gia servito nella settimana corrente (% - %).', v_start_settimana, v_end_settimana;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_distribuzioni_no_doppio_ritiro_settimanale ON public.distribuzioni;
CREATE TRIGGER trg_distribuzioni_no_doppio_ritiro_settimanale
    BEFORE INSERT OR UPDATE OF nucleo_id, data ON public.distribuzioni
    FOR EACH ROW EXECUTE FUNCTION public.fn_distribuzioni_no_doppio_ritiro_settimanale();

-- Helper: verifica se l'utente corrente è admin
CREATE OR REPLACE FUNCTION public.fn_is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM   auth.users
        WHERE  id    = auth.uid()
        AND    email = 'e.croce88@gmail.com'
    );
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.access_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nuclei               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.componenti           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iscrizioni           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribuzioni        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articoli             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimenti_magazzino  ENABLE ROW LEVEL SECURITY;

-- Rende il blocco policy idempotente in caso di rilancio script
DROP POLICY IF EXISTS "access_requests: inserimento pubblico" ON public.access_requests;
DROP POLICY IF EXISTS "access_requests: solo admin legge" ON public.access_requests;
DROP POLICY IF EXISTS "access_requests: solo admin aggiorna" ON public.access_requests;
DROP POLICY IF EXISTS "access_requests: solo admin elimina" ON public.access_requests;

DROP POLICY IF EXISTS "nuclei: lettura per autenticati" ON public.nuclei;
DROP POLICY IF EXISTS "nuclei: inserimento per autenticati" ON public.nuclei;
DROP POLICY IF EXISTS "nuclei: modifica per autenticati" ON public.nuclei;
DROP POLICY IF EXISTS "nuclei: eliminazione solo admin" ON public.nuclei;

DROP POLICY IF EXISTS "componenti: lettura per autenticati" ON public.componenti;
DROP POLICY IF EXISTS "componenti: inserimento per autenticati" ON public.componenti;
DROP POLICY IF EXISTS "componenti: modifica per autenticati" ON public.componenti;
DROP POLICY IF EXISTS "componenti: eliminazione solo admin" ON public.componenti;
DROP POLICY IF EXISTS "componenti: eliminazione per autenticati" ON public.componenti;

DROP POLICY IF EXISTS "iscrizioni: lettura per autenticati" ON public.iscrizioni;
DROP POLICY IF EXISTS "iscrizioni: inserimento per autenticati" ON public.iscrizioni;
DROP POLICY IF EXISTS "iscrizioni: modifica solo admin" ON public.iscrizioni;
DROP POLICY IF EXISTS "iscrizioni: eliminazione solo admin" ON public.iscrizioni;

DROP POLICY IF EXISTS "distribuzioni: lettura per autenticati" ON public.distribuzioni;
DROP POLICY IF EXISTS "distribuzioni: inserimento per autenticati" ON public.distribuzioni;
DROP POLICY IF EXISTS "distribuzioni: modifica solo admin" ON public.distribuzioni;
DROP POLICY IF EXISTS "distribuzioni: modifica nota per autenticati" ON public.distribuzioni;
DROP POLICY IF EXISTS "distribuzioni: eliminazione solo admin" ON public.distribuzioni;

DROP POLICY IF EXISTS "articoli: lettura per autenticati" ON public.articoli;
DROP POLICY IF EXISTS "articoli: inserimento solo admin" ON public.articoli;
DROP POLICY IF EXISTS "articoli: modifica solo admin" ON public.articoli;
DROP POLICY IF EXISTS "articoli: eliminazione solo admin" ON public.articoli;

DROP POLICY IF EXISTS "movimenti: lettura per autenticati" ON public.movimenti_magazzino;
DROP POLICY IF EXISTS "movimenti: inserimento per autenticati" ON public.movimenti_magazzino;
DROP POLICY IF EXISTS "movimenti: modifica solo admin" ON public.movimenti_magazzino;
DROP POLICY IF EXISTS "movimenti: eliminazione solo admin" ON public.movimenti_magazzino;

-- ── access_requests ──────────────────────────────────────────
-- Chiunque (anche non autenticato) può inviare una richiesta di accesso
CREATE POLICY "access_requests: inserimento pubblico"
    ON public.access_requests FOR INSERT
    WITH CHECK (TRUE);

-- Solo admin può leggere, aggiornare o eliminare le richieste
CREATE POLICY "access_requests: solo admin legge"
    ON public.access_requests FOR SELECT
    USING (public.fn_is_admin());

CREATE POLICY "access_requests: solo admin aggiorna"
    ON public.access_requests FOR UPDATE
    USING (public.fn_is_admin())
    WITH CHECK (public.fn_is_admin());

CREATE POLICY "access_requests: solo admin elimina"
    ON public.access_requests FOR DELETE
    USING (public.fn_is_admin());

-- ── nuclei ───────────────────────────────────────────────────
CREATE POLICY "nuclei: lettura per autenticati"
    ON public.nuclei FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "nuclei: inserimento per autenticati"
    ON public.nuclei FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "nuclei: modifica per autenticati"
    ON public.nuclei FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Eliminazione fisica solo admin; gli altri usano archiviato=TRUE
CREATE POLICY "nuclei: eliminazione solo admin"
    ON public.nuclei FOR DELETE
    USING (public.fn_is_admin());

-- ── componenti ───────────────────────────────────────────────
CREATE POLICY "componenti: lettura per autenticati"
    ON public.componenti FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "componenti: inserimento per autenticati"
    ON public.componenti FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "componenti: modifica per autenticati"
    ON public.componenti FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "componenti: eliminazione per autenticati"
    ON public.componenti FOR DELETE
    USING (auth.role() = 'authenticated');

-- ── iscrizioni ─────────────────────────────────────────────
CREATE POLICY "iscrizioni: lettura per autenticati"
    ON public.iscrizioni FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "iscrizioni: inserimento per autenticati"
    ON public.iscrizioni FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Le iscrizioni sono append-only; solo admin può correggere o eliminare
CREATE POLICY "iscrizioni: modifica solo admin"
    ON public.iscrizioni FOR UPDATE
    USING (public.fn_is_admin())
    WITH CHECK (public.fn_is_admin());

CREATE POLICY "iscrizioni: eliminazione solo admin"
    ON public.iscrizioni FOR DELETE
    USING (public.fn_is_admin());

-- ── distribuzioni ────────────────────────────────────────────
CREATE POLICY "distribuzioni: lettura per autenticati"
    ON public.distribuzioni FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "distribuzioni: inserimento per autenticati"
    ON public.distribuzioni FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Solo admin può correggere distribuzioni già registrate
CREATE POLICY "distribuzioni: modifica solo admin"
    ON public.distribuzioni FOR UPDATE
    USING (public.fn_is_admin())
    WITH CHECK (public.fn_is_admin());

-- Gli operatori autenticati possono aggiornare note operative sulla distribuzione
CREATE POLICY "distribuzioni: modifica nota per autenticati"
    ON public.distribuzioni FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Gli operatori autenticati possono annullare una distribuzione (undo/sblocco)
CREATE POLICY "distribuzioni: eliminazione solo admin"
    ON public.distribuzioni FOR DELETE
    USING (auth.role() = 'authenticated');

-- ── articoli ─────────────────────────────────────────────────
CREATE POLICY "articoli: lettura per autenticati"
    ON public.articoli FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "articoli: inserimento solo admin"
    ON public.articoli FOR INSERT
    WITH CHECK (public.fn_is_admin());

CREATE POLICY "articoli: modifica solo admin"
    ON public.articoli FOR UPDATE
    USING (public.fn_is_admin())
    WITH CHECK (public.fn_is_admin());

CREATE POLICY "articoli: eliminazione solo admin"
    ON public.articoli FOR DELETE
    USING (public.fn_is_admin());

-- ── movimenti_magazzino ──────────────────────────────────────
CREATE POLICY "movimenti: lettura per autenticati"
    ON public.movimenti_magazzino FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "movimenti: inserimento per autenticati"
    ON public.movimenti_magazzino FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- I movimenti non si modificano: solo admin può correggere in casi eccezionali
CREATE POLICY "movimenti: modifica solo admin"
    ON public.movimenti_magazzino FOR UPDATE
    USING (public.fn_is_admin())
    WITH CHECK (public.fn_is_admin());

CREATE POLICY "movimenti: eliminazione solo admin"
    ON public.movimenti_magazzino FOR DELETE
    USING (public.fn_is_admin());

-- ============================================================
-- GRANTS
-- ============================================================

-- Ruolo anon: può solo inserire richieste di accesso
GRANT USAGE  ON SCHEMA public TO anon;
GRANT INSERT ON public.access_requests TO anon;

-- Ruolo authenticated: accesso completo alle tabelle (RLS gestisce i vincoli)
GRANT USAGE  ON SCHEMA public TO authenticated;
GRANT ALL    ON public.access_requests    TO authenticated;
GRANT ALL    ON public.nuclei             TO authenticated;
GRANT ALL    ON public.componenti         TO authenticated;
GRANT ALL    ON public.iscrizioni         TO authenticated;
GRANT ALL    ON public.distribuzioni      TO authenticated;
GRANT ALL    ON public.articoli           TO authenticated;
GRANT ALL    ON public.movimenti_magazzino TO authenticated;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_is_admin()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_fascia_eta(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rinnovo_massivo_annuale() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_distribuzioni_no_doppio_ritiro_settimanale() TO authenticated;

-- ============================================================
-- FINE SCRIPT
-- ============================================================
