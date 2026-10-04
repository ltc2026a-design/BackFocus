import jwt from "jsonwebtoken";
import { prisma, config } from "../prisma.js";
import { ApiError, asyncHandler } from "../utils/errors.js";
import { userShape } from "../utils/serialize.js";

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new ApiError(401, "UNAUTHORIZED", "Token de acceso requerido");
  }
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Token inválido o expirado");
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
  if (!usuario) throw new ApiError(401, "UNAUTHORIZED", "Usuario no existe");
  req.user = userShape(usuario);
  next();
});

export const requireAdmin = (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "UNAUTHORIZED", "Sin sesión"));
  if (req.user.rol !== "ADMIN") {
    return next(new ApiError(403, "ADMIN_REQUIRED", "Se requiere rol ADMIN"));
  }
  next();
};
