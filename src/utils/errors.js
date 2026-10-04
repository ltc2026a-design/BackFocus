export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Envuelve un handler y lanza 404 NOT_FOUND si el recurso no existe.
export function notFound(body, message = "Recurso no encontrado") {
  if (!body) throw new ApiError(404, "NOT_FOUND", message);
  return body;
}

// Control de acceso: el dueño o un ADMIN. Si no → 403 FORBIDDEN.
export function assertOwnerOrAdmin(resource, user, message = "Recurso ajeno") {
  const ownerId = resource.usuarioId ?? resource.userId;
  if (ownerId !== user.id && user.rol !== "ADMIN") {
    throw new ApiError(403, "FORBIDDEN", message);
  }
}
