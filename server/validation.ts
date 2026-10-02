import { z } from "zod";
const id = z.string().min(1).max(100);
const column = z.string().min(1).max(500);
const source = z
  .object({
    id,
    name: z.string().min(1).max(300),
    columns: z.array(column).min(1).max(100),
    numeric: z.array(column).max(100),
    dates: z.array(column).max(100),
    rows: z.array(z.record(z.string().max(100000))).max(20000),
    demo: z.literal(false),
    createdAt: z.string().max(100),
    remoteInfo: z
      .object({
        provider: z.enum(["omie", "contaazul"]),
        from: z.string().max(10),
        to: z.string().max(10),
        excluded: z.number().int().nonnegative(),
        fetchedAt: z.string().max(100),
      })
      .strict()
      .optional(),
    recipe: z
      .object({
        leftId: id,
        rightId: id,
        rightName: z.string().min(1).max(300),
        options: z
          .object({
            mode: z.enum(["append", "left", "inner"]),
            leftKey: z.string().max(500),
            rightKey: z.string().max(500),
            trim: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .optional(),
    lastLoad: z
      .object({
        mode: z.enum(["append", "upsert", "replace-period"]),
        keys: z.array(column).min(1).max(60),
        dateField: z.string().max(500).optional(),
        start: z.string().max(20).optional(),
        end: z.string().max(20).optional(),
        at: z.string().max(100),
        file: z.string().max(300),
        summary: z
          .object({
            added: z.number().int().nonnegative(),
            updated: z.number().int().nonnegative(),
            unchanged: z.number().int().nonnegative(),
            removed: z.number().int().nonnegative(),
            duplicates: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict()
      .optional(),
    importNotes: z
      .object({
        file: z.string().max(300),
        sheet: z.string().max(300),
        header: z.number().int().positive(),
        end: z.number().int().positive(),
        details: z.string().max(2000),
      })
      .optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (
      new Set(s.columns).size !== s.columns.length ||
      [...s.numeric, ...s.dates].some((c) => !s.columns.includes(c)) ||
      s.rows.some((r) => Object.keys(r).some((k) => !s.columns.includes(k)))
    )
      ctx.addIssue({
        code: "custom",
        message: "Colunas incompatíveis com os registros.",
      });
  });
const config = z
  .object({
    title: z.string().min(1).max(300),
    metric: z.string(),
    dimension: z.string(),
    chart: z.enum(["area", "bar"]),
    aggregation: z.enum(["sum", "average", "count"]),
    period: z.enum(["all", "30", "90"]),
    visuals: z.array(z.object({ id }).passthrough()).max(24).optional(),
    dataSteps: z
      .array(z.object({ id, kind: z.string() }))
      .max(60)
      .optional(),
  })
  .passthrough();
// Validate limits without stripping the calculation parameters saved in each step.
const dashboard = z
  .object({
    id,
    sourceId: id,
    folder: z.string().max(80).optional(),
    starred: z.boolean().optional(),
    config: config.extend({
      dataSteps: z
        .array(z.object({ id, kind: z.string() }).passthrough())
        .max(60)
        .optional(),
    }),
    updatedAt: z.string().max(100),
  })
  .strict();
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    sources: z.array(source).max(50),
    dashboards: z.array(dashboard),
  })
  .strict()
  .superRefine((w, ctx) => {
    if (
      new Set(w.sources.map((s) => s.id)).size !== w.sources.length ||
      new Set(w.dashboards.map((d) => d.id)).size !== w.dashboards.length ||
      w.sources.some((s) => s.id === "demo-vendas") ||
      w.dashboards.some(
        (d) =>
          d.sourceId !== "demo-vendas" &&
          !w.sources.some((s) => s.id === d.sourceId),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Fontes ou dashboards inconsistentes.",
      });
  });
export const credentialsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(128),
    name: z.string().trim().min(2).max(100).optional(),
    acceptedTerms: z.boolean().optional(),
  })
  .strict();
export const saveSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    workspace: workspaceSchema,
  })
  .strict();

export const activationSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: z.string().min(12).max(128),
  })
  .strict();
