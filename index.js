const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const P = require('pino');

const sesiones = {};

const frasesReinicio = [
  "nuevo pedido",
  "otra cotizacion",
  "quiero empezar de nuevo",
  "empezar otra vez",
  "volver a empezar",
  "reiniciar"
];

const frasesInicio = [
  "hola quiero mas informacion",
  "hola quiero info",
  "info",
  "informacion"
];

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[¡!.,]/g, "") // quitar signos
    .trim();
}

async function startBot() {
  console.log("🚀 Iniciando el bot...");
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("📷 Escanea este código QR con tu WhatsApp:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "connecting") {
      console.log("🔄 Conectando a WhatsApp...");
    }
    if (connection === "open") {
      console.log("✅ Bot conectado a WhatsApp");
    }
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("❌ Conexión cerrada:", lastDisconnect?.error);
      if (shouldReconnect) {
        console.log("🔁 Reintentando conexión...");
        startBot();
      } else {
        console.log("🔒 Sesión cerrada. Escanea el QR nuevamente.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
    const sender = msg.key.remoteJid;
    const textoNormalizado = normalizarTexto(texto);

    const respuestasRapidas = {
      "1": `🪪 Tarjetas de Presentación:\nSon tarjetas de 5.5x9 cm impresas a full color por ambas caras en couche 350 Gr. plastificado mate.\n💰 S/ 49 por 1000 unidades.\n⏱️ Entrega: 24h después de aprobar diseño.\n🎨 Diseño incluido.\n\n¿Deseas continuar con tu pedido?`,
      "2": `📄 Volantes Publicitarios:\nImpresos en couche 115gr a full color por ambas caras.\n📏 Medidas y precios:\n- 1/4 de oficio: S/ 56 x millar\n- 1/2 oficio: S/ 110 x millar\n- 1 oficio: S/ 200 x millar\n🎨 Diseño incluido.\n⏱️ Entrega: 24h después de aprobar diseño.\n\n¿Deseas continuar con tu pedido?`,
      "3": `🖼️ Roll Screen:\nRoll Screen de aluminio de 2m x 1m.\nIncluye: estuche y diseño personalizado.\n💰 Precio: S/ 115\n🎨 Si no tienes diseño, te lo realizamos sin costo adicional.\n\n¿Deseas continuar con tu pedido?`,
      "4": `🏷️ Stickers o Viniles:\nLa plancha tiene una medida de 1.45 x 1 metro.\nCosto: S/ 45 por plancha.\n🎨 Si no tienes diseño, te lo realizamos sin costo adicional.\n\n¿Deseas continuar con tu pedido?`,
      "5": `🧱 Módulos Publicitarios:\nMódulo portátil en PVC, rotulado con tu diseño.\n💰 Precio: S/ 249\n🎒 Incluye estuche para fácil transporte.\n🎨 Diseño incluido.\n\n¿Deseas continuar con tu pedido?`,
      "6": `🖼️ Parante de Fierro:\nParantes de fierro de 2m x 1m.\n💰 Precio: S/ 95\n🎨 Diseño incluido.\n\n¿Deseas continuar con tu pedido?`,
      "7": `💻 Proformas:\n📲 Un asesor se comunicará contigo para conocer tu proyecto y brindarte una propuesta a medida.`,
      "8": `🤔 Cuéntame con más detalle qué necesitas, ¡y con gusto te ayudamos!`
    };

    // 👉 Reinicio de sesión
    if (frasesReinicio.includes(textoNormalizado)) {
      sesiones[sender] = { finalizado: false };

      await sock.sendMessage(sender, {
        text: `👌 ¡Listo! Empezamos de nuevo.\n\n¿Sobre qué producto deseas información?\n\n1️⃣ TARJETAS DE PRESENTACIÓN\n2️⃣ VOLANTES PUBLICITARIOS\n3️⃣ ROLL SCREEN\n4️⃣ STICKERS\n5️⃣ MÓDULOS PUBLICITARIOS\n6️⃣ PARANTES DE FIERRO\n7️⃣ PROFORMAS\n8️⃣ OTROS\n\n*Responde con el número del producto (1 al 8).*`
      });
      return;
    }

    // 👉 Activación inicial del bot
    if (!sesiones[sender] && frasesInicio.includes(textoNormalizado)) {
      sesiones[sender] = { finalizado: false };

      await sock.sendMessage(sender, {
        text: `¡Hola! 😊 Gracias por escribirnos.\n\nOfrecemos tarjetas, volantes, Stickers, módulos, roll screen y más.\n\n📍 Estamos en Av. Bolivia 148, Centro Lima.\n🚚 Hacemos delivery en Lima y envíos a provincia (costo adicional).\n\n¿Sobre qué producto deseas información?\n\n1️⃣ TARJETAS DE PRESENTACIÓN\n2️⃣ VOLANTES PUBLICITARIOS\n3️⃣ ROLL SCREEN\n4️⃣ STICKERS\n5️⃣ MÓDULOS PUBLICITARIOS\n6️⃣ PARANTES DE FIERRO\n7️⃣ PROFORMAS\n8️⃣ OTROS\n\n*Responde con el número del producto.*`
      });
      return;
    }

    // 👀 Si no hay sesión activa o ya finalizó, no responder nada
    if (!sesiones[sender] || sesiones[sender].finalizado) return;

    // ✅ Si responde con número válido (1-8), enviar respuesta y marcar como finalizado
    if (respuestasRapidas[textoNormalizado]) {
      await sock.sendMessage(sender, { text: respuestasRapidas[textoNormalizado] });
      sesiones[sender].finalizado = true;
    }

    // ❌ Si no es un número válido, no responder nada
  });
}

startBot();
