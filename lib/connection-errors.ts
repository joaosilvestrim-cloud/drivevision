// Only fixed, non-sensitive codes travel through an OAuth redirect.
export const CONNECTION_ERRORS: Record<string, string> = {
  ca_state: "A autorização Conta Azul expirou ou já foi utilizada. Inicie uma nova conexão nesta mesma sessão.",
  ca_credentials: "O Conta Azul recusou as credenciais do aplicativo DriveVision. O administrador precisa revisar a configuração da integração.",
  ca_grant: "O Conta Azul recusou o código de autorização. Ele pode ter expirado ou já ter sido utilizado. Inicie uma nova conexão.",
  ca_token: "O Conta Azul recusou a troca da autorização por acesso. O administrador precisa conferir as credenciais do aplicativo e a URL de retorno.",
  ca_unavailable: "O Conta Azul não respondeu à troca da autorização. Inicie uma nova conexão em alguns instantes.",
  ca_response: "O Conta Azul retornou uma autorização em formato inesperado. Informe este erro ao suporte DriveData.",
  ca_identity: "A autorização foi recebida, mas não foi possível identificar a conta Conta Azul. Informe este erro ao suporte DriveData.",
  ca_storage: "A autorização foi recebida, mas não foi possível salvar a conexão no DriveVision. Informe este erro ao suporte DriveData.",
};
