import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
} from "discord.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const RIOT_URL = "https://americas.api.riotgames.com";
let treinoAtivo = false;
let ultimoMatchId = null;
let monitoramentoInterval = null;

const commands = [
  {
    name: "treino",
    description: "Gerencia os treinos do time",
    options: [
      {
        name: "acao",
        description: "Escolha iniciar ou finalizar o treino",
        type: 3,
        required: true,
        choices: [
          { name: "iniciar", value: "iniciar" },
          { name: "finalizar", value: "finalizar" },
        ],
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function getPuuid() {
  const { data } = await axios.get(
    `${RIOT_URL}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      process.env.SUMMONER_NAME
    )}/${encodeURIComponent(process.env.TAG_LINE)}`,
    { headers: { "X-Riot-Token": process.env.RIOT_API_KEY } }
  );
  return data.puuid;
}

async function getUltimaPartida(puuid) {
  const { data } = await axios.get(
    `${RIOT_URL}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=1`,
    { headers: { "X-Riot-Token": process.env.RIOT_API_KEY } }
  );
  return data[0];
}

async function getDetalhesPartida(matchId) {
  const { data } = await axios.get(
    `${RIOT_URL}/lol/match/v5/matches/${matchId}`,
    { headers: { "X-Riot-Token": process.env.RIOT_API_KEY } }
  );
  return data;
}

async function monitorarPartidas() {
  if (!treinoAtivo) return;

  try {
    const puuid = await getPuuid();
    const matchId = await getUltimaPartida(puuid);

    if (matchId && matchId !== ultimoMatchId) {
      console.log(`🎯 Nova partida detectada: ${matchId}`);

      const partida = await getDetalhesPartida(matchId);
      const participante = partida.info.participants.find(
        (p) =>
          p.riotIdGameName?.toLowerCase() ===
          process.env.SUMMONER_NAME.toLowerCase()
      );

      if (!participante) return;

      const resultado = participante.win ? "✅ Vitória" : "❌ Derrota";
      const kda = `${participante.kills}/${participante.deaths}/${participante.assists}`;

      const embed = new EmbedBuilder()
        .setTitle(`🏋️ Treino finalizado: ${resultado}`)
        .setColor(participante.win ? 0x57f287 : 0xed4245)
        .addFields(
          { name: "Campeão", value: participante.championName, inline: true },
          { name: "KDA", value: kda, inline: true },
          {
            name: "Tempo de partida",
            value: `${Math.floor(partida.info.gameDuration / 60)} min`,
            inline: true,
          }
        )
        .setTimestamp();

      const channel = await client.channels.fetch(process.env.CHANNEL_ID);
      await channel.send({ embeds: [embed] });

      ultimoMatchId = matchId;
    } else {
      console.log("🔁 Nenhuma nova partida detectada ainda...");
    }
  } catch (err) {
    console.error("Erro no monitoramento:", err.response?.data || err.message);
  }
}

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ Comandos registrados na guild!");
  } catch (err) {
    console.error("Erro ao registrar comandos:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "treino") {
    const acao = interaction.options.getString("acao");
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    if (acao === "iniciar") {
      treinoAtivo = true;
      ultimoMatchId = null;
      const puuid = await getPuuid();
      ultimoMatchId = await getUltimaPartida(puuid);
      await channel.send(
        "🚀 Treino iniciado! O bot vai monitorar novas partidas."
      );
      await interaction.reply({
        content: "Treino iniciado com sucesso! 🎯",
        ephemeral: true,
      });

      if (monitoramentoInterval) clearInterval(monitoramentoInterval);
      monitoramentoInterval = setInterval(monitorarPartidas, 60 * 1000);
    }

    if (acao === "finalizar") {
      treinoAtivo = false;
      if (monitoramentoInterval) clearInterval(monitoramentoInterval);
      await channel.send("✅ Treino finalizado!");
      await interaction.reply({
        content: "Treino encerrado!",
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
