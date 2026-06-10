import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/api/supabase";

export type ZonaDistribuzione = "Pombio" | "Duomo" | "Medassino" | "San Rocco";
export type StatoNucleo = "verde" | "nero" | "rosso" | "bozza";

export const ZONE_DISTRIBUZIONE: ZonaDistribuzione[] = [
  "Pombio",
  "Duomo",
  "Medassino",
  "San Rocco",
];

export type DistribuzioneRow = {
  nucleoId: string;
  codiceFiscale: string | null;
  zona: ZonaDistribuzione;
  stato: StatoNucleo;
  cognomeTesserato: string;
  nomeTesserato: string;
  cognomeCapofamiglia: string | null;
  nomeCapofamiglia: string | null;
  capofamigliaDiverso: boolean;
  numeroTessera: string | null;
  scadenzaTessera: string | null;
  giaServitoSettimana: boolean;
  ultimaDistribuzione: string | null;
  distribuzioneSelezionataId: string | null;
  notaDistribuzione: string | null;
  haNotaDistribuzione: boolean;
  numeroPacchi: number | null;
};

type NucleoRaw = {
  id: string;
  codice_fiscale: string | null;
  zona: ZonaDistribuzione;
  stato: StatoNucleo;
  componenti: Array<{
    id: string;
    ruolo: string;
    nome: string;
    cognome: string;
    codice_fiscale: string | null;
    data_nascita: string | null;
  }>;
  iscrizioni: Array<{
    id: string;
    numero_tessera: string;
    data_scadenza: string | null;
    created_at: string;
  }>;
};

type DistribuzioneRaw = {
  id: string;
  nucleo_id: string;
  data: string;
  note: string | null;
  numero_pacchi: number | null;
  created_at: string;
};

function getWeekRangeISO(baseDate = new Date()) {
  const date = new Date(baseDate);
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;

  const start = new Date(date);
  start.setDate(date.getDate() - diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function getPrioritizedComponent(components: NucleoRaw["componenti"]) {
  return (
    components.find((item) => item.ruolo === "titolare") ??
    components.find((item) => item.ruolo === "capofamiglia") ??
    components.slice().sort((a, b) => {
      const aTs = a.data_nascita
        ? new Date(a.data_nascita).getTime()
        : Number.POSITIVE_INFINITY;
      const bTs = b.data_nascita
        ? new Date(b.data_nascita).getTime()
        : Number.POSITIVE_INFINITY;
      return aTs - bTs;
    })[0]
  );
}

function getCapofamigliaComponent(components: NucleoRaw["componenti"]) {
  return components.find((item) => item.ruolo === "capofamiglia");
}

function areSamePerson(
  a: NucleoRaw["componenti"][number] | undefined,
  b: NucleoRaw["componenti"][number] | undefined,
) {
  if (!a || !b) return false;
  if (a.id === b.id) return true;

  const aKey = `${a.nome}|${a.cognome}|${a.data_nascita ?? ""}`
    .trim()
    .toLowerCase();
  const bKey = `${b.nome}|${b.cognome}|${b.data_nascita ?? ""}`
    .trim()
    .toLowerCase();
  return aKey === bKey;
}

function getLatestIscrizione(iscrizioni: NucleoRaw["iscrizioni"]) {
  if (!iscrizioni.length) return null;
  return iscrizioni
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
}

function mapNucleoToRow(
  nucleo: NucleoRaw,
  servedThisWeek: Set<string>,
  latestByNucleo: Map<string, string>,
  selectedDistribuzioneByNucleo: Map<string, DistribuzioneRaw>,
) {
  const principale = getPrioritizedComponent(nucleo.componenti);
  const capofamiglia = getCapofamigliaComponent(nucleo.componenti);
  const capofamigliaDiverso = Boolean(
    capofamiglia && principale && !areSamePerson(capofamiglia, principale),
  );
  const latestIscrizione = getLatestIscrizione(nucleo.iscrizioni);
  const selectedDist = selectedDistribuzioneByNucleo.get(nucleo.id);

  return {
    nucleoId: nucleo.id,
    codiceFiscale: principale?.codice_fiscale ?? nucleo.codice_fiscale,
    zona: nucleo.zona,
    stato: nucleo.stato,
    cognomeTesserato: principale?.cognome?.trim() ?? "—",
    nomeTesserato: principale?.nome?.trim() ?? "",
    cognomeCapofamiglia: capofamiglia?.cognome?.trim() ?? null,
    nomeCapofamiglia: capofamiglia?.nome?.trim() ?? null,
    capofamigliaDiverso,
    numeroTessera: latestIscrizione?.numero_tessera ?? null,
    scadenzaTessera: latestIscrizione?.data_scadenza ?? null,
    giaServitoSettimana: servedThisWeek.has(nucleo.id),
    ultimaDistribuzione: latestByNucleo.get(nucleo.id) ?? null,
    distribuzioneSelezionataId: selectedDist?.id ?? null,
    notaDistribuzione: selectedDist?.note ?? null,
    haNotaDistribuzione: Boolean(selectedDist?.note),
    numeroPacchi: selectedDist?.numero_pacchi ?? null,
  } as DistribuzioneRow;
}

function matchSearch(row: DistribuzioneRow, query: string) {
  const low = query.toLowerCase().trim();
  if (!low) return true;

  const fullName = `${row.cognomeTesserato} ${row.nomeTesserato}`.toLowerCase();
  const capoName =
    `${row.cognomeCapofamiglia ?? ""} ${row.nomeCapofamiglia ?? ""}`.toLowerCase();
  if (fullName.includes(low)) return true;
  if (row.capofamigliaDiverso && capoName.includes(low)) return true;
  if (row.codiceFiscale?.toLowerCase().includes(low)) return true;
  if (row.numeroTessera?.toLowerCase().includes(low)) return true;
  return false;
}

function sortByTesserato(a: DistribuzioneRow, b: DistribuzioneRow) {
  const cognomeCompare = a.cognomeTesserato.localeCompare(
    b.cognomeTesserato,
    "it",
    { sensitivity: "base" },
  );
  if (cognomeCompare !== 0) return cognomeCompare;
  return a.nomeTesserato.localeCompare(b.nomeTesserato, "it", {
    sensitivity: "base",
  });
}

export function useDistribuzione() {
  const [rows, setRows] = useState<DistribuzioneRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [centro, setCentro] = useState<ZonaDistribuzione | "">("");
  const [dataDistribuzione, setDataDistribuzione] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [statoFilter, setStatoFilter] = useState<StatoNucleo | "">("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!centro) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError("");

    const { start, end } = getWeekRangeISO(new Date(dataDistribuzione));

    const [nucleiResult, distResult] = await Promise.all([
      supabase
        .from("nuclei")
        .select(
          "id, codice_fiscale, zona, stato, componenti(id, ruolo, nome, cognome, codice_fiscale, data_nascita), iscrizioni(id, numero_tessera, data_scadenza, created_at)",
        )
        .eq("archiviato", false)
        .eq("zona", centro),
      supabase
        .from("distribuzioni")
        .select("id, nucleo_id, data, note, numero_pacchi, created_at")
        .eq("centro", centro),
    ]);

    if (nucleiResult.error) {
      setError(nucleiResult.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    if (distResult.error) {
      setError(distResult.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const nuclei = (nucleiResult.data ?? []) as NucleoRaw[];
    const distribuzioni = (distResult.data ?? []) as DistribuzioneRaw[];

    const servedThisWeek = new Set(
      distribuzioni
        .filter((item) => item.data >= start && item.data <= end)
        .map((item) => item.nucleo_id),
    );
    const latestByNucleo = new Map<string, string>();
    const selectedDistribuzioneByNucleo = new Map<string, DistribuzioneRaw>();

    for (const item of distribuzioni) {
      const prev = latestByNucleo.get(item.nucleo_id);
      if (!prev || new Date(item.data).getTime() > new Date(prev).getTime()) {
        latestByNucleo.set(item.nucleo_id, item.data);
      }

      if (item.data !== dataDistribuzione) continue;
      const current = selectedDistribuzioneByNucleo.get(item.nucleo_id);
      if (
        !current ||
        new Date(item.created_at).getTime() >
          new Date(current.created_at).getTime()
      ) {
        selectedDistribuzioneByNucleo.set(item.nucleo_id, item);
      }
    }

    const mapped = nuclei.map((nucleo) =>
      mapNucleoToRow(
        nucleo,
        servedThisWeek,
        latestByNucleo,
        selectedDistribuzioneByNucleo,
      ),
    );
    mapped.sort(sortByTesserato);

    setRows(mapped);
    setLoading(false);
  }, [centro, dataDistribuzione]);

  const registerConsegna = useCallback(
    async (
      nucleoId: string,
      operatoreId: string | undefined | null,
      numeroPacchi?: number | null,
    ) => {
      if (!centro)
        return { ok: false as const, message: "Seleziona prima il centro." };
      if (!operatoreId)
        return {
          ok: false as const,
          message: "Sessione non valida: operatore non disponibile.",
        };

      const existing = rows.find((item) => item.nucleoId === nucleoId);
      if (!existing)
        return { ok: false as const, message: "Nucleo non trovato." };
      if (existing.giaServitoSettimana) {
        return {
          ok: false as const,
          message: "Nucleo gia servito in questa settimana.",
        };
      }

      setSavingId(nucleoId);
      setError("");

      const { data, error: insertError } = await supabase
        .from("distribuzioni")
        .insert({
          nucleo_id: nucleoId,
          centro,
          data: dataDistribuzione,
          operatore_id: operatoreId,
          numero_pacchi: numeroPacchi ?? null,
        })
        .select("id, nucleo_id, data, note, numero_pacchi")
        .single();

      setSavingId(null);

      if (insertError || !data) {
        return {
          ok: false as const,
          message: insertError?.message ?? "Errore salvataggio distribuzione.",
        };
      }

      const rowDate = data.data as string;

      setRows((prev) =>
        prev.map((item) =>
          item.nucleoId === nucleoId
            ? {
                ...item,
                giaServitoSettimana: true,
                ultimaDistribuzione: rowDate,
                distribuzioneSelezionataId: data.id as string,
                notaDistribuzione: (data.note as string | null) ?? null,
                haNotaDistribuzione: Boolean(data.note),
                numeroPacchi: (data.numero_pacchi as number | null) ?? null,
              }
            : item,
        ),
      );

      return {
        ok: true as const,
        data: {
          distribuzioneId: data.id as string,
          nucleoId,
        },
      };
    },
    [centro, rows, dataDistribuzione],
  );

  const undoConsegna = useCallback(
    async (distribuzioneId: string, nucleoId: string) => {
      setSavingId(nucleoId);
      setError("");

      const { error: deleteError } = await supabase
        .from("distribuzioni")
        .delete()
        .eq("id", distribuzioneId);

      setSavingId(null);

      if (deleteError) {
        return { ok: false as const, message: deleteError.message };
      }

      await load();

      return { ok: true as const };
    },
    [load],
  );

  const saveNotaConsegna = useCallback(
    async (distribuzioneId: string, nucleoId: string, note: string) => {
      setSavingId(nucleoId);
      setError("");

      const normalized = note.trim() || null;
      const { error: updateError } = await supabase
        .from("distribuzioni")
        .update({ note: normalized })
        .eq("id", distribuzioneId);

      setSavingId(null);

      if (updateError) {
        return { ok: false as const, message: updateError.message };
      }

      setRows((prev) =>
        prev.map((item) =>
          item.nucleoId === nucleoId
            ? {
                ...item,
                notaDistribuzione: normalized,
                haNotaDistribuzione: Boolean(normalized),
              }
            : item,
        ),
      );

      return { ok: true as const };
    },
    [],
  );

  const sbloccaUltimaDistribuzione = useCallback(
    async (nucleoId: string) => {
      if (!centro) {
        return { ok: false as const, message: "Seleziona prima il centro." };
      }

      setSavingId(nucleoId);
      setError("");

      const { data: lastDist, error: fetchError } = await supabase
        .from("distribuzioni")
        .select("id, data, created_at")
        .eq("nucleo_id", nucleoId)
        .eq("centro", centro)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        setSavingId(null);
        return { ok: false as const, message: fetchError.message };
      }

      if (!lastDist) {
        setSavingId(null);
        return {
          ok: false as const,
          message: "Nessuna distribuzione trovata da annullare.",
        };
      }

      const { error: deleteError } = await supabase
        .from("distribuzioni")
        .delete()
        .eq("id", lastDist.id);

      setSavingId(null);

      if (deleteError) {
        return { ok: false as const, message: deleteError.message };
      }

      await load();
      return { ok: true as const };
    },
    [centro, load],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      if (statoFilter && item.stato !== statoFilter) return false;
      if (!matchSearch(item, search)) return false;
      return true;
    });
  }, [rows, search, statoFilter]);

  return {
    centro,
    setCentro,
    dataDistribuzione,
    setDataDistribuzione,
    statoFilter,
    setStatoFilter,
    search,
    setSearch,
    rows: filteredRows,
    totalRows: rows.length,
    loading,
    error,
    setError,
    savingId,
    load,
    registerConsegna,
    undoConsegna,
    saveNotaConsegna,
    sbloccaUltimaDistribuzione,
  };
}
