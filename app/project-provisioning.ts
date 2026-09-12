import { env } from "cloudflare:workers";
import { mergeDomainKind, type DomainKind } from "./domain-utils";
import { assertDomainAvailable } from "./project-domains";

type PreparedStatement = ReturnType<typeof env.DB.prepare>;

type PasswordHash = {
  passwordHash: string;
  passwordSalt: string;
};

type ProvisionClientAccessInput = {
  createProject: boolean;
  projectId: string;
  projectName: string;
  projectSlug: string;
  adminId: string;
  email: string;
  name: string;
  password: PasswordHash;
  actor: { id: string; email: string };
  auditDetails: Record<string, unknown>;
  publicHost: string | null;
  adminHost: string | null;
  now: string;
};

type ExistingDomain = {
  host: string;
  projectId: string;
  kind: DomainKind;
};

function projectBrand(value: string) {
  const clean = value.replace(/[—–-].*$/g, "").trim() || value.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const short = (
    words.length > 1 ? words.map((word) => word[0]).join("") : clean.slice(0, 3)
  )
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 4) || "PRJ";

  return {
    brandName: clean.toUpperCase().slice(0, 50),
    brandShort: short,
  };
}

function defaultProjectSettings(projectName: string) {
  const brand = projectBrand(projectName);
  return {
    projectName,
    brandName: brand.brandName,
    brandShort: brand.brandShort,
    template: "plots",
    accentColor: "#f0b323",
    location: "",
    address: "",
    phone1: "",
    phone2: "",
    whatsapp: "",
    mapUrl: "",
    brochureUrl: "",
    shareTitle: projectName,
    shareDescription: `Explore ${projectName} with AR 3D interactive plot visualization.`,
    shareTemplate: "original-image-v1",
  };
}

async function existingDomain(host: string) {
  return env.DB.prepare(
    "SELECT host,project_id AS projectId,kind FROM project_domains WHERE host=? LIMIT 1",
  )
    .bind(host)
    .first<ExistingDomain>();
}

async function preparePrimaryDomainStatements(
  projectId: string,
  publicHost: string | null,
  adminHost: string | null,
  now: string,
) {
  const requested = [
    publicHost ? ({ kind: "public", host: publicHost } as const) : null,
    adminHost ? ({ kind: "admin", host: adminHost } as const) : null,
  ].filter(
    (entry): entry is { kind: "public" | "admin"; host: string } => Boolean(entry),
  );

  if (!requested.length) return [] as PreparedStatement[];

  const hosts = [...new Set(requested.map((entry) => entry.host))];
  for (const host of hosts) await assertDomainAvailable(host, projectId);

  const rows = await Promise.all(
    hosts.map(async (host) => [host, await existingDomain(host)] as const),
  );
  const existingByHost = new Map(rows);

  for (const row of existingByHost.values()) {
    if (row && row.projectId !== projectId) {
      throw new Error("Domain kisi aur project me use ho raha hai");
    }
  }

  const statements: PreparedStatement[] = [];

  if (publicHost) {
    statements.push(
      env.DB.prepare(
        "UPDATE project_domains SET public_primary=0,updated_at=? WHERE project_id=?",
      ).bind(now, projectId),
    );
  }
  if (adminHost) {
    statements.push(
      env.DB.prepare(
        "UPDATE project_domains SET admin_primary=0,updated_at=? WHERE project_id=?",
      ).bind(now, projectId),
    );
  }

  if (publicHost && adminHost && publicHost === adminHost) {
    const current = existingByHost.get(publicHost);
    if (current) {
      statements.push(
        env.DB.prepare(
          "UPDATE project_domains SET kind='both',status='active',public_primary=1,admin_primary=1,updated_at=? WHERE host=? AND project_id=?",
        ).bind(now, publicHost, projectId),
      );
    } else {
      statements.push(
        env.DB.prepare(
          "INSERT INTO project_domains (host,project_id,kind,public_primary,admin_primary,status,created_at,updated_at) VALUES (?,?,'both',1,1,'active',?,?)",
        ).bind(publicHost, projectId, now, now),
      );
    }
  } else {
    for (const entry of requested) {
      const current = existingByHost.get(entry.host);
      const primaryColumn =
        entry.kind === "public" ? "public_primary" : "admin_primary";

      if (current) {
        const nextKind = mergeDomainKind(current.kind, entry.kind);
        statements.push(
          env.DB.prepare(
            `UPDATE project_domains SET kind=?,status='active',${primaryColumn}=1,updated_at=? WHERE host=? AND project_id=?`,
          ).bind(nextKind, now, entry.host, projectId),
        );
      } else {
        statements.push(
          env.DB.prepare(
            "INSERT INTO project_domains (host,project_id,kind,public_primary,admin_primary,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)",
          ).bind(
            entry.host,
            projectId,
            entry.kind,
            entry.kind === "public" ? 1 : 0,
            entry.kind === "admin" ? 1 : 0,
            now,
            now,
          ),
        );
      }
    }
  }

  if (publicHost) {
    statements.push(
      env.DB.prepare(
        "UPDATE projects SET public_host=?,updated_at=? WHERE id=?",
      ).bind(publicHost, now, projectId),
    );
  }
  if (adminHost) {
    statements.push(
      env.DB.prepare(
        "UPDATE projects SET admin_host=?,updated_at=? WHERE id=?",
      ).bind(adminHost, now, projectId),
    );
  }

  return statements;
}

export async function provisionClientAccess(input: ProvisionClientAccessInput) {
  const statements: PreparedStatement[] = [];

  if (input.createProject) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO projects (id,name,slug,public_host,admin_host,status,created_at,updated_at) VALUES (?,?,?,NULL,NULL,'active',?,?)",
      ).bind(
        input.projectId,
        input.projectName,
        input.projectSlug,
        input.now,
        input.now,
      ),
    );

    for (const [key, value] of Object.entries(
      defaultProjectSettings(input.projectName),
    )) {
      statements.push(
        env.DB.prepare(
          "INSERT INTO settings (project_id,key,value,updated_at) VALUES (?,?,?,?)",
        ).bind(input.projectId, key, value, input.now),
      );
    }
  }

  statements.push(
    ...(await preparePrimaryDomainStatements(
      input.projectId,
      input.publicHost,
      input.adminHost,
      input.now,
    )),
  );

  statements.push(
    env.DB.prepare(
      "INSERT INTO admin_users (id,email,name,project_id,role,password_hash,password_salt,status,must_change_password,session_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      input.adminId,
      input.email,
      input.name,
      input.projectId,
      "client_admin",
      input.password.passwordHash,
      input.password.passwordSalt,
      "active",
      1,
      1,
      input.now,
      input.now,
    ),
  );

  statements.push(
    env.DB.prepare(
      "INSERT INTO audit_logs (id,actor_id,actor_email,action,project_id,target_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      input.actor.id,
      input.actor.email,
      "client.created",
      input.projectId,
      input.adminId,
      JSON.stringify(input.auditDetails),
      input.now,
    ),
  );

  // D1 batch is the commit boundary for the complete onboarding mutation,
  // including its audit record. Any project/domain/admin/audit failure rolls
  // the whole onboarding write set back together.
  await env.DB.batch(statements);
}
