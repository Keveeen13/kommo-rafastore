// As colunas agora são geradas AUTOMATICAMENTE a partir de todos os campos do lead.
// Aqui ficam só os padrões de quem ainda não personalizou (botão "Colunas e funis" no painel).

// Colunas fixas visíveis por padrão (ids definidos em LeadsTable.tsx)
export const DEFAULT_BUILTIN_VISIBLE = ["id", "created", "name", "phone", "pipeline", "stage", "resp"];

// Campos personalizados visíveis por padrão (nome EXATO na Kommo; os que não existirem são ignorados)
export const DEFAULT_CUSTOM_VISIBLE = [
  "Classificação do lead",
  "Perfil do lead",
  "Status",
  "Origem da paciente",
  "Procedimento",
  "Previsão para operar",
];

// Tipos de campo da Kommo que viram filtro (lista suspensa) automaticamente
export const SELECT_LIKE_TYPES = ["select", "multiselect", "radiobutton", "checkbox"];
