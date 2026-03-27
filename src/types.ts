import "hono";

declare module "hono" {
  interface ContextVariableMap {
    user: {
      id: string;
      email: string;
      name: string;
      isActive: boolean;
    };
  }
}
