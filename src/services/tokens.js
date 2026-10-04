import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma, config } from "../prisma.js";

export function signAccessToken(usuario) {
  return jwt.sign({ sub: usuario.id, rol: usuario.rol }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn, // 30 min
  });
}

// Crea un refresh token aleatorio y lo persiste en BD (rotación en /auth/refresh).
export async function issueRefreshToken(usuarioId) {
  const token = crypto.randomBytes(48).toString("hex");
  const expiraEn = new Date(
    Date.now() + config.jwtRefreshExpiresDays * 24 * 60 * 60 * 1000
  );
  await prisma.refreshToken.create({ data: { usuarioId, token, expiraEn } });
  return token;
}

export async function issueTokenPair(usuario) {
  const accessToken = signAccessToken(usuario);
  const refreshToken = await issueRefreshToken(usuario.id);
  return { accessToken, refreshToken };
}

// Valida un refresh token persistido y devuelve el registro (o null).
export async function findValidRefreshToken(token) {
  if (!token) return null;
  const registro = await prisma.refreshToken.findUnique({
    where: { token },
    include: { usuario: true },
  });
  if (!registro || registro.revocado || registro.expiraEn < new Date()) return null;
  return registro;
}

export async function revokeRefreshToken(id) {
  await prisma.refreshToken.update({ where: { id }, data: { revocado: true } });
}
