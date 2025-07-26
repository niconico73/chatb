const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const P = require('pino');
const { responderConIA } = require('./gpt');

const sesiones = {};

const frasesReinicio = [
  "nuevo pedido",
  "otra cotizacion",
  "quiero empezar de nuevo",
  "empezar otra vez",
  "volver a empezar"
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

function dividirMensajeLargo(texto, maxLongitud = 4000) {
  const partes = [];
  let inicio = 0;
  while (inicio < texto.length) {
    let fin = inicio + maxLongitud;
    if (fin < texto.length) {
      const ultimoSalto = texto.lastIndexOf('\n', fin);
      const ultimoEspacio = texto.lastIndexOf(' ', fin);
      const corteNatural = Math.max(ultimoSalto, ultimoEspacio);
      if (corteNatural > inicio) fin = corteNatural;
    }
    const parte = texto.slice(inicio, fin).trim();
    if (parte) partes.push(parte);
    inicio = fin;
  }
  return partes;
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

      // 👉 Reinicio de sesión
if (frasesReinicio.includes(textoNormalizado)) {
  // Elimina la sesión anterior (si existía) y crea una nueva
  delete sesiones[sender];
  sesiones[sender] = { historial: [], finalizado: false };

  await sock.sendMessage(sender, {
    text: `👌 ¡Listo! Empezamos de nuevo.\n\n¿Sobre qué producto deseas información?\n\n1️⃣ TARJETAS DE PRESENTACIÓN\n2️⃣ VOLANTES PUBLICITARIOS\n3️⃣ GIGANTOGRAFÍAS\n4️⃣ ROLL SCREEN\n5️⃣ STICKERS / VINILES\n6️⃣ MÓDULOS\n7️⃣ PÁGINAS WEB\n8️⃣ OTROS\n\nResponde con el número o el nombre del producto.`
  });
  return;
}

    // 👉 Activación inicial del bot
    if (!sesiones[sender] && frasesInicio.includes(textoNormalizado)) {
      await sock.sendMessage(sender, {
        text: `¡Hola! 😊 Gracias por escribirnos.\n\nOfrecemos tarjetas, volantes, gigantografías, módulos, roll screen, viniles y más.\n\n📍 Estamos en Av. Bolivia 148, Centro Lima.\n🚚 Hacemos delivery en Lima y envíos a provincia (costo adicional).\n\n¿Sobre qué producto deseas información?\n\n1️⃣ TARJETAS DE PRESENTACIÓN\n2️⃣ VOLANTES PUBLICITARIOS\n3️⃣ GIGANTOGRAFÍAS\n4️⃣ ROLL SCREEN\n5️⃣ STICKERS / VINILES\n6️⃣ MÓDULOS\n7️⃣ PÁGINAS WEB\n8️⃣ OTROS`
      });
      sesiones[sender] = { historial: [], finalizado: false };
      return;
    }

    // 👉 Si no está iniciada la sesión, ignorar
    if (!sesiones[sender]) return;

    if (sesiones[sender]?.finalizado) return;

    console.log(`📩 Mensaje de ${sender}: ${texto}`);

    try {
      const respuestasRapidas = {
        "1": `🪪 Tarjetas de Presentación:\nSon tarjetas de 5.5x9 cm impresas a full color por ambas caras en couche 350 Gr. plastificado mate.\n💰 S/ 49 por 1000 unidades.\n⏱️ Entrega: 24h después de aprobar diseño.\n🎨 Diseño incluido.`,
        "2": `📄 Volantes Publicitarios:\nImpresos en couche 115gr a full color por ambas caras.\n📏 Medidas y precios:\n- 1/4 de oficio: S/ 56 x millar\n- 1/2 oficio: S/ 110 x millar\n- 1 oficio: S/ 200 x millar\n🎨 Diseño incluido.\n⏱️ Entrega: 24h después de aprobar diseño.`,
        "3": `🖼️ Gigantografías:\nEstas se cotizan según tamaño y material.\n📲 Un asesor se pondrá en contacto contigo para ayudarte.`,
        "4": `📢 Roll Screen o Parantes:\nRoll Screen de aluminio de 2m x 1m.\nIncluye: estuche y diseño personalizado.\n💰 Precio: S/ 115\n🎨 Si no tienes diseño, te lo realizamos sin costo adicional.`,
        "5": `🏷️ Stickers o Viniles:\nVarían según cantidad, corte y medida.\n📲 Te contactamos con un asesor para darte la mejor cotización.`,
        "6": `🧱 Módulos Publicitarios:\nMódulo portátil en PVC, rotulado con tu diseño.\n💰 Precio: S/ 249\n🎒 Incluye estuche para fácil transporte.\n🎨 Si no tienes diseño, lo hacemos sin costo.`,
        "7": `💻 Páginas Web:\n📲 Un asesor se comunicará contigo para conocer tu proyecto y brindarte una propuesta a medida.`,
        "8": `🤔 Cuéntame con más detalle qué necesitas, ¡y con gusto te ayudamos!`
      };

      const textoSimple = textoNormalizado;

      if (respuestasRapidas[textoSimple]) {
        const respuesta = respuestasRapidas[textoSimple];
        await sock.sendMessage(sender, { text: respuesta });
        sesiones[sender].historial.push({ role: "assistant", content: respuesta });
        return;
      }

      sesiones[sender].historial.push({ role: "user", content: texto });
      if (sesiones[sender].historial.length > 10) sesiones[sender].historial.splice(1, 1);

      const partes = await responderConIA(sesiones[sender].historial);
      for (const parte of partes) {
        await sock.sendMessage(sender, { text: parte });
        sesiones[sender].historial.push({ role: "assistant", content: parte });
      }

      const textoFinal = partes.join(" ").toLowerCase();
      if (
        textoFinal.includes("bcp: 19492223312059") ||
        textoFinal.includes("scotiabank: 0357487081") ||
        textoFinal.includes("yape") ||
        textoFinal.includes("plin")
      ) {
        sesiones[sender].finalizado = true;
        console.log(`✅ Conversación finalizada con ${sender}`);
      }

    } catch (e) {
      console.error("❌ Error:", e.message);
      await sock.sendMessage(sender, { text: "Ocurrió un error. Intenta más tarde." });
    }
  });
}

startBot();
