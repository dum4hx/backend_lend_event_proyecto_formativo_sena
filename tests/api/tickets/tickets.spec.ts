import { test, expect } from "@playwright/test";

test.describe("Tickets Module", () => {
  test.describe.configure({ mode: "serial" });

  let locationId: string;
  let ticketId: string;

  test.beforeAll(async ({ request }) => {
    // Create a location (the authenticated owner is auto-assigned to it)
    const locRes = await request.post("locations", {
      data: {
        name: `Ticket Test Location ${Date.now()}`,
        address: {
          streetType: "Calle",
          primaryNumber: "10",
          secondaryNumber: "20",
          complementaryNumber: "30",
          department: "Cundinamarca",
          city: "Bogotá",
        },
      },
    });
    expect(locRes.ok()).toBeTruthy();
    const locBody = await locRes.json();
    locationId = locBody.data._id;
  });

  /* ------------------------------------------------------------------ */
  /*  CREATE                                                             */
  /* ------------------------------------------------------------------ */

  test("POST /tickets - should create a generic ticket", async ({
    request,
  }) => {
    const response = await request.post("tickets", {
      data: {
        locationId,
        type: "generic",
        title: "Solicitud de prueba genérica",
        description: "Descripción de prueba para ticket genérico",
        payload: {
          details: "Detalle genérico de la solicitud de prueba",
        },
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.type).toBe("generic");
    expect(body.data.status).toBe("pending");
    expect(body.data.title).toBe("Solicitud de prueba genérica");
    expect(body.data.locationId.toString()).toBe(locationId);
    expect(body.data.payload).toEqual({
      details: "Detalle genérico de la solicitud de prueba",
    });
    ticketId = body.data._id;
  });

  test("POST /tickets - should create a transfer_request ticket", async ({
    request,
  }) => {
    // Create a second location to use as destination
    const loc2Res = await request.post("locations", {
      data: {
        name: `Ticket Dest Location ${Date.now()}`,
        address: {
          streetType: "Carrera",
          primaryNumber: "50",
          secondaryNumber: "60",
          complementaryNumber: "70",
          department: "Antioquia",
          city: "Medellín",
        },
      },
    });
    expect(loc2Res.ok()).toBeTruthy();
    const loc2Body = await loc2Res.json();
    const toLocationId = loc2Body.data._id;

    // Create a category + material type for the transfer payload
    const catRes = await request.post("materials/categories", {
      data: {
        name: `Ticket Cat ${Date.now()}`,
        description: "Cat for ticket test",
      },
    });
    expect(catRes.ok()).toBeTruthy();
    const catBody = await catRes.json();
    const categoryId = catBody.data.category._id;

    const typeRes = await request.post("materials/types", {
      data: {
        name: `Ticket Type ${Date.now()}`,
        description: "Type for ticket test",
        categoryId: [categoryId],
        pricePerDay: 500,
      },
    });
    expect(typeRes.ok()).toBeTruthy();
    const typeBody = await typeRes.json();
    const materialTypeId = typeBody.data.materialType._id;

    const response = await request.post("tickets", {
      data: {
        locationId,
        type: "transfer_request",
        title: "Solicitud de transferencia de equipos",
        payload: {
          toLocationId,
          items: [{ materialTypeId, quantity: 5 }],
        },
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.type).toBe("transfer_request");
    expect(body.data.status).toBe("pending");
    expect(body.data.payload.toLocationId).toBe(toLocationId);
    expect(body.data.payload.items).toHaveLength(1);
    expect(body.data.payload.items[0].quantity).toBe(5);
  });

  test("POST /tickets - should reject invalid ticket type", async ({
    request,
  }) => {
    const response = await request.post("tickets", {
      data: {
        locationId,
        type: "invalid_type",
        title: "Ticket inválido",
        payload: { details: "..." },
      },
    });
    expect(response.status()).toBe(400);
  });

  test("POST /tickets - should reject ticket without required payload fields", async ({
    request,
  }) => {
    const response = await request.post("tickets", {
      data: {
        locationId,
        type: "transfer_request",
        title: "Sin payload correcto",
        payload: {},
      },
    });
    expect(response.status()).toBe(400);
  });

  test("POST /tickets - should reject ticket for non-member location", async ({
    request,
  }) => {
    // Use a fabricated but valid ObjectId that the user does not belong to
    const fakeLocationId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const response = await request.post("tickets", {
      data: {
        locationId: fakeLocationId,
        type: "generic",
        title: "Ticket en sede ajena",
        payload: { details: "No debería funcionar" },
      },
    });
    // Should be 404 (location not found) or 403
    expect([403, 404]).toContain(response.status());
  });

  test("POST /tickets - should reject past responseDeadline", async ({
    request,
  }) => {
    const pastDate = new Date("2020-01-01T00:00:00.000Z").toISOString();
    const response = await request.post("tickets", {
      data: {
        locationId,
        type: "generic",
        title: "Ticket con fecha pasada",
        responseDeadline: pastDate,
        payload: { details: "Fecha límite en el pasado" },
      },
    });
    expect(response.status()).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /*  LIST                                                               */
  /* ------------------------------------------------------------------ */

  test("GET /tickets - should list tickets", async ({ request }) => {
    const response = await request.get("tickets");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(Array.isArray(body.data.tickets)).toBeTruthy();
    expect(body.data.tickets.length).toBeGreaterThan(0);
    expect(body.data).toHaveProperty("total");
    expect(body.data).toHaveProperty("page");
    expect(body.data).toHaveProperty("totalPages");
  });

  test("GET /tickets - should filter by type", async ({ request }) => {
    const response = await request.get("tickets?type=generic");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    for (const ticket of body.data.tickets) {
      expect(ticket.type).toBe("generic");
    }
  });

  test("GET /tickets - should filter by status", async ({ request }) => {
    const response = await request.get("tickets?status=pending");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    for (const ticket of body.data.tickets) {
      expect(ticket.status).toBe("pending");
    }
  });

  test("GET /tickets - should filter by locationId", async ({ request }) => {
    const response = await request.get(`tickets?locationId=${locationId}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    for (const ticket of body.data.tickets) {
      // locationId is populated as an object
      const locId =
        typeof ticket.locationId === "object"
          ? ticket.locationId._id
          : ticket.locationId;
      expect(locId.toString()).toBe(locationId);
    }
  });

  test("GET /tickets - should support pagination", async ({ request }) => {
    const response = await request.get("tickets?page=1&limit=1");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.tickets.length).toBeLessThanOrEqual(1);
    expect(body.data.page).toBe(1);
  });

  /* ------------------------------------------------------------------ */
  /*  GET BY ID                                                          */
  /* ------------------------------------------------------------------ */

  test("GET /tickets/:id - should get ticket by id", async ({ request }) => {
    const response = await request.get(`tickets/${ticketId}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data._id).toBe(ticketId);
    expect(body.data.type).toBe("generic");
  });

  test("GET /tickets/:id - should return 400 for invalid id", async ({
    request,
  }) => {
    const response = await request.get("tickets/invalid-id");
    expect(response.status()).toBe(400);
  });

  test("GET /tickets/:id - should return 404 for non-existent id", async ({
    request,
  }) => {
    const response = await request.get("tickets/aaaaaaaaaaaaaaaaaaaaaaaa");
    // Returns 404 because user is not creator/assignee of non-existent ticket
    expect(response.status()).toBe(404);
  });

  /* ------------------------------------------------------------------ */
  /*  CANCEL                                                             */
  /* ------------------------------------------------------------------ */

  test("PATCH /tickets/:id/cancel - should cancel own ticket", async ({
    request,
  }) => {
    // Create a ticket to cancel
    const createRes = await request.post("tickets", {
      data: {
        locationId,
        type: "generic",
        title: "Ticket para cancelar",
        payload: { details: "Se va a cancelar" },
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    const cancelTargetId = created.data._id;

    const response = await request.patch(`tickets/${cancelTargetId}/cancel`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("success");
    expect(body.data.status).toBe("cancelled");
  });

  test("PATCH /tickets/:id/cancel - should reject cancelling already cancelled ticket", async ({
    request,
  }) => {
    // Create and cancel first
    const createRes = await request.post("tickets", {
      data: {
        locationId,
        type: "generic",
        title: "Ticket doble cancelación",
        payload: { details: "Se va a cancelar dos veces" },
      },
    });
    const created = await createRes.json();
    const id = created.data._id;

    await request.patch(`tickets/${id}/cancel`);

    // Try to cancel again — should fail (invalid transition)
    const response = await request.patch(`tickets/${id}/cancel`);
    expect(response.status()).toBe(409);
  });

  test("PATCH /tickets/:id/cancel - should return 400 for invalid id", async ({
    request,
  }) => {
    const response = await request.patch("tickets/bad-id/cancel");
    expect(response.status()).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /*  REVIEW / APPROVE / REJECT — Error Paths                           */
  /*  (Single-user tests: creator cannot review own ticket)              */
  /* ------------------------------------------------------------------ */

  test("PATCH /tickets/:id/review - should reject reviewing own ticket", async ({
    request,
  }) => {
    const response = await request.patch(`tickets/${ticketId}/review`);
    expect(response.status()).toBe(403);
  });

  test("PATCH /tickets/:id/approve - should reject approving own ticket", async ({
    request,
  }) => {
    const response = await request.patch(`tickets/${ticketId}/approve`, {
      data: {},
    });
    expect(response.status()).toBe(403);
  });

  test("PATCH /tickets/:id/reject - should reject rejecting own ticket", async ({
    request,
  }) => {
    const response = await request.patch(`tickets/${ticketId}/reject`, {
      data: { resolutionNote: "No aplica" },
    });
    expect(response.status()).toBe(403);
  });

  test("PATCH /tickets/:id/reject - should require resolutionNote", async ({
    request,
  }) => {
    const response = await request.patch(`tickets/${ticketId}/reject`, {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  test("PATCH /tickets/:id/review - should return 404 for non-existent ticket", async ({
    request,
  }) => {
    const response = await request.patch(
      "tickets/aaaaaaaaaaaaaaaaaaaaaaaa/review",
    );
    expect(response.status()).toBe(404);
  });

  test("PATCH /tickets/:id/approve - should return 400 for invalid id", async ({
    request,
  }) => {
    const response = await request.patch("tickets/bad-id/approve", {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /*  Incident Report Ticket                                             */
  /* ------------------------------------------------------------------ */

  test("POST /tickets - should create an incident_report ticket", async ({
    request,
  }) => {
    const response = await request.post("tickets", {
      data: {
        locationId,
        type: "incident_report",
        title: "Reporte de incidente de prueba",
        payload: {
          severity: "high",
          context: "storage",
          description: "Daño en estantería durante almacenamiento",
        },
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.type).toBe("incident_report");
    expect(body.data.payload.severity).toBe("high");
    expect(body.data.payload.context).toBe("storage");
  });

  /* ------------------------------------------------------------------ */
  /*  Maintenance Request Ticket                                         */
  /* ------------------------------------------------------------------ */

  test("POST /tickets - should reject maintenance_request without materialInstanceIds", async ({
    request,
  }) => {
    const response = await request.post("tickets", {
      data: {
        locationId,
        type: "maintenance_request",
        title: "Mantenimiento sin instancias",
        payload: {
          entryReason: "damaged",
        },
      },
    });
    expect(response.status()).toBe(400);
  });

  /* ------------------------------------------------------------------ */
  /*  Inspection Request Ticket                                          */
  /* ------------------------------------------------------------------ */

  test("POST /tickets - should reject inspection_request without loanId", async ({
    request,
  }) => {
    const response = await request.post("tickets", {
      data: {
        locationId,
        type: "inspection_request",
        title: "Inspección sin préstamo",
        payload: {},
      },
    });
    expect(response.status()).toBe(400);
  });
});
