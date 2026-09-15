// Modo LEGADO (sem Firebase configurado): senha hardcoded, só para você
// continuar testando o esqueleto visual localmente sem precisar criar o
// projeto Firebase primeiro. Troque aqui se quiser mudar essa senha de teste.
//
// Quando o Firebase estiver configurado (.env preenchido), o login passa a
// usar Firebase Authentication de verdade (ver Login.jsx) e este valor deixa
// de ser usado — a senha real fica só no Firebase, nunca no código.
export const ACCESS_PASSWORD = 'imperium2024';

// E-mail fixo da única conta de acesso ao painel, usada com Firebase Auth.
// Crie esse usuário manualmente em Firebase Console > Authentication >
// Users > Add user, com a senha que você quiser. O campo de login continua
// pedindo só a senha — este e-mail fica escondido do usuário.
export const ACCESS_EMAIL = 'caioac2006@gmail.com';
