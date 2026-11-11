// Colunas do dashboard que vêm de CAMPOS PERSONALIZADOS da Kommo.
// "field" = nome EXATO do campo na Kommo (veja os nomes em GET /api/fields).
// Para adicionar uma coluna nova: acrescente uma linha aqui. Não precisa mexer no banco
// nem reimportar: todos os campos personalizados de cada lead já ficam salvos.
export type CustomColumn = { field: string; label: string; filterable?: boolean; width?: number };

export const CUSTOM_COLUMNS: CustomColumn[] = [
  { field: "Classificação do lead", label: "Classificação do lead", filterable: true, width: 190 },
  { field: "Perfil do lead", label: "Perfil do lead", filterable: true, width: 170 },
  { field: "Status", label: "Status", filterable: true, width: 160 },
  { field: "Origem da paciente", label: "Origem da paciente", filterable: true, width: 180 },
  { field: "Procedimento", label: "Procedimento", filterable: true, width: 170 },
  { field: "Previsão para operar", label: "Previsão para operar", filterable: true, width: 190 },
  { field: "Localização", label: "Localização", filterable: true, width: 150 },
  { field: "Operou", label: "Operou", filterable: true, width: 110 },
  { field: "Acompanha o Dr a quanto tempo", label: "Acompanha o Dr há quanto tempo", width: 230 },
  { field: "Paciente Indicador", label: "Paciente indicador", width: 180 },
  { field: "Informações do(a) paciente:", label: "Informações do(a) paciente", width: 260 },
];
