// Colunas do dashboard que vêm de CAMPOS PERSONALIZADOS da Kommo.
// "field" = nome EXATO do campo na Kommo (veja os nomes em GET /api/fields).
// Para adicionar uma coluna nova: acrescente uma linha aqui. Não precisa mexer no banco.
export type CustomColumn = { field: string; label: string; filterable?: boolean; width?: number };

export const CUSTOM_COLUMNS: CustomColumn[] = [
  { field: "Vendedor", label: "Vendedor", filterable: true, width: 110 },
  { field: "Marca", label: "Marca", width: 190 },
  { field: "Produto procurado", label: "Produto procurado", filterable: true, width: 170 },
  { field: "Origem do lead", label: "Origem do lead", filterable: true, width: 170 },
  { field: "Perfil do lead", label: "Perfil do lead", filterable: true, width: 150 },
  { field: "Status do lead", label: "Status do lead", filterable: true, width: 170 },
  { field: "Previsão de compra", label: "Previsão de compra", filterable: true, width: 170 },
];
