// Versões gravadas no backup (para saber, ao restaurar, de que "época" do app e do banco ele veio).
export const VERSAO_APP = '2.0.0-fase6'
export const BACKUP_VERSAO = 1 // formato do arquivo; subir quando a estrutura do JSON mudar
export const SCHEMA_BANCO = 17 // número da última migration (inbox/NN_*.sql) que o app espera
