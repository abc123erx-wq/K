import { useMemo, useState } from "react";
import { parseCompendium, type CompendiumItem } from "../game/item_database_bloco1";
import type { GameEngine } from "../game/engine";

interface ItemEncyclopediaProps {
  isOpen: boolean;
  onClose: () => void;
  engineRef: React.RefObject<GameEngine | null>;
  godMode: boolean;
}

const CATEGORIES = [
  "Todos",
  "Armas brancas",
  "Armas de fogo",
  "Munição e acessórios",
  "Ferramentas",
  "Construção/base",
  "Comida e água",
  "Medicina/curas",
  "Roupas/armaduras",
  "Peças e sucata",
  "Eletrônicos",
  "Químicos/combustíveis",
  "Luxo/colecionáveis",
  "Chaves/documentos",
  "Itens de missão",
  "Props de cenário"
];

const RARITIES = ["Todos", "Comum", "Incomum", "Raro", "Épico", "Lendário"];

export default function ItemEncyclopedia({ isOpen, onClose, engineRef, godMode }: ItemEncyclopediaProps) {
  const compendium = useMemo(() => parseCompendium(), []);
  const [selectedItem, setSelectedItem] = useState<CompendiumItem | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todos");
  const [rarityFilter, setRarityFilter] = useState("Todos");
  const [spawnNotice, setSpawnNotice] = useState("");

  const filteredItems = useMemo(() => {
    return compendium.filter((item) => {
      const matchSearch = item.nome.toLowerCase().includes(search.toLowerCase()) ||
        item.descricao.toLowerCase().includes(search.toLowerCase()) ||
        item.id.includes(search);
      const matchCat = categoryFilter === "Todos" || item.categoria === categoryFilter;
      const matchRarity = rarityFilter === "Todos" || item.raridade === rarityFilter;
      return matchSearch && matchCat && matchRarity;
    });
  }, [compendium, search, categoryFilter, rarityFilter]);

  if (!isOpen) return null;

  const spawnItem = (item: CompendiumItem) => {
    if (!engineRef.current) return;
    engineRef.current.adminSpawnItemFromCompendium(item);
    setSpawnNotice(`Spawned 1x ${item.nome} to inventory!`);
    setTimeout(() => setSpawnNotice(""), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0d]/95 font-mono text-zinc-200 backdrop-blur-md">
      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2a2a2a] bg-[#111111] px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black uppercase text-[#d96b3a]">Knox Database — Loot Compendium</h1>
            <span className="rounded border border-[#4a5c45] bg-[#1f2521] px-2 py-0.5 text-xs text-[#cdd7bf]">Bloco 1 (00001–00500)</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Explorador de itens, estatísticas de sobrevivência e gerador de loot</p>
        </div>
        <div className="flex items-center gap-3">
          {godMode && <span className="text-xs font-bold text-[#d96b3a]">🛡️ Admin Spawning Enabled</span>}
          <button onClick={onClose} className="border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-xs uppercase tracking-widest text-zinc-400 hover:border-[#d96b3a] hover:text-[#d96b3a]">
            ✕ Fechar
          </button>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-b border-[#2a2a2a] bg-[#151515] p-4">
        <div className="md:col-span-2 flex items-center gap-2 border border-[#2a2a2a] bg-black px-3 py-2">
          <span>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, ID ou descrição..."
            className="w-full bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none"
          />
          {search && <button onClick={() => setSearch("")} className="text-xs text-zinc-500">✕</button>}
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full border border-[#2a2a2a] bg-black px-3 py-2.5 text-xs text-zinc-300 outline-none focus:border-[#4a5c45]"
          >
            {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>

        <div>
          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
            className="w-full border border-[#2a2a2a] bg-black px-3 py-2.5 text-xs text-zinc-300 outline-none focus:border-[#4a5c45]"
          >
            {RARITIES.map((r) => <option key={r} value={r}>Raridade: {r}</option>)}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left List */}
        <div className="flex-1 overflow-y-auto border-r border-[#2a2a2a] p-4">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
            <span>Listando {filteredItems.length} de {compendium.length} itens</span>
            <span className="text-[10px]">Clique em um item para detalhes</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {filteredItems.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              const rColor =
                item.raridade === "Lendário" ? "border-amber-500/60 bg-amber-950/20 text-amber-400" :
                item.raridade === "Épico" ? "border-purple-500/60 bg-purple-950/20 text-purple-400" :
                item.raridade === "Raro" ? "border-blue-500/60 bg-blue-950/20 text-blue-400" :
                item.raridade === "Incomum" ? "border-[#8a6a2a] bg-[#2a2010] text-[#d7c9a7]" :
                "border-[#2a2a2a] bg-black/40 text-zinc-400";

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`cursor-pointer border p-3 transition-all ${isSelected ? "border-[#d96b3a] bg-[#2a1714]" : "hover:border-[#4a5c45] hover:bg-[#1a201a]"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-bold text-zinc-500">#{item.id}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${rColor}`}>{item.raridade}</span>
                  </div>
                  <h3 className="mt-1 truncate font-bold text-zinc-200">{item.nome}</h3>
                  <p className="mt-0.5 text-[10px] text-zinc-500">{item.categoria}</p>
                  <div className="mt-2 flex items-center justify-between border-t border-[#2a2a2a]/60 pt-2 text-[10px] text-zinc-400">
                    <span>⚖️ {item.peso_kg.toFixed(2)}kg</span>
                    <span>💵 ${item.valor}</span>
                    <span>📦 x{item.stack}</span>
                  </div>
                </div>
              );
            })}
            {filteredItems.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-600">
                Nenhum item encontrado com esses filtros.
              </div>
            )}
          </div>
        </div>

        {/* Right Detail Pane */}
        {selectedItem ? (
          <aside className="w-full md:w-96 flex flex-col border-l border-[#2a2a2a] bg-[#111111] p-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-4">
              <span className="text-xs font-bold text-zinc-500">ID: {selectedItem.id}</span>
              <button onClick={() => setSelectedItem(null)} className="text-xs text-zinc-400 hover:text-zinc-200">✕ Fechar Painel</button>
            </div>

            <div className="mt-4">
              <span className={`inline-block rounded border px-2 py-0.5 text-[10px] uppercase font-bold ${
                selectedItem.raridade === "Lendário" ? "border-amber-500 bg-amber-950 text-amber-400" :
                selectedItem.raridade === "Épico" ? "border-purple-500 bg-purple-950 text-purple-400" :
                selectedItem.raridade === "Raro" ? "border-blue-500 bg-blue-950 text-blue-400" :
                selectedItem.raridade === "Incomum" ? "border-yellow-600 bg-yellow-950 text-yellow-300" :
                "border-zinc-700 bg-zinc-900 text-zinc-300"
              }`}>{selectedItem.raridade}</span>
              <h2 className="mt-2 text-2xl font-black text-[#d7c9a7] leading-tight">{selectedItem.nome}</h2>
              <p className="mt-1 text-xs uppercase tracking-widest text-[#7f936f]">{selectedItem.categoria}</p>
            </div>

            <div className="mt-4 rounded border border-[#2a2a2a] bg-black p-4 text-xs leading-relaxed text-zinc-300">
              "{selectedItem.descricao}"
            </div>

            <div className="mt-6 space-y-3 border-b border-[#2a2a2a] pb-6 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-900">
                <span className="text-zinc-500">⚖️ Peso Unitário</span>
                <span className="font-bold text-zinc-200">{selectedItem.peso_kg.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-900">
                <span className="text-zinc-500">🛡️ Durabilidade</span>
                <span className="font-bold text-zinc-200">{selectedItem.durabilidade}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-900">
                <span className="text-zinc-500">📦 Empilhamento (Stack)</span>
                <span className="font-bold text-zinc-200">Máx {selectedItem.stack} por slot</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-900">
                <span className="text-zinc-500">💵 Valor de Mercado</span>
                <span className="font-bold text-[#d96b3a]">{selectedItem.valor} moedas</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-900">
                <span className="text-zinc-500">🎯 Uso Principal</span>
                <span className="font-bold text-[#cdd7bf]">{selectedItem.uso_principal}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">🗺️ Onde Achar (Locais de Spawn)</span>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.onde_achar.split(";").map((loc) => (
                  <span key={loc} className="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-[10px] text-zinc-300 uppercase">
                    📍 {loc}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-2 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">⚡ Interações Possíveis</span>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.interacoes.split(";").map((act) => (
                  <span key={act} className="rounded border border-[#4a5c45] bg-[#1f2521] px-2 py-1 text-[10px] text-[#cdd7bf] uppercase font-bold">
                    ▪ {act}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded border border-zinc-800 bg-zinc-950 p-4 text-xs">
              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">🛠️ Receita de Crafting</span>
              <p className="mt-1 font-mono text-zinc-300">
                {selectedItem.receita === "-" ? "Sem receita artesanal disponível (Apenas saque/loot)" : selectedItem.receita}
              </p>
            </div>

            {godMode && (
              <div className="mt-8 pt-4 border-t border-[#2a2a2a]">
                <button
                  onClick={() => spawnItem(selectedItem)}
                  className="w-full bg-[#8a2f22] py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-[#b5452e] shadow-lg shadow-black active:scale-95 transition-all"
                >
                  ⚡ Spawnar no Inventário
                </button>
                {spawnNotice && <p className="mt-2 text-center text-xs text-[#4aff4a]">{spawnNotice}</p>}
              </div>
            )}
          </aside>
        ) : (
          <div className="hidden md:flex w-96 flex-col items-center justify-center border-l border-[#2a2a2a] bg-[#111111] p-6 text-center text-zinc-600">
            <span className="text-4xl">📖</span>
            <p className="mt-2 text-xs">Selecione um item no catálogo para inspecionar estatísticas completas, locais de spawn e receitas.</p>
          </div>
        )}
      </div>

      <footer className="border-t border-[#2a2a2a] bg-black px-6 py-2 text-center text-[10px] text-zinc-500">
        FIM_DO_BLOCO;proximo_id=00501
      </footer>
    </div>
  );
}
