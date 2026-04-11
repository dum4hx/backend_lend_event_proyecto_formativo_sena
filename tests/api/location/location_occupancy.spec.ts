import { test, expect } from "@playwright/test";
import {
  generateRandomName,
  generateRandomSerial,
} from "../../utils/helpers.ts";

test.describe("Location Occupancy Consistency", () => {
  test.describe.configure({ mode: "serial" });

  let primaryLocationId: string;
  let secondaryLocationId: string | null = null;
  let materialTypeId: string;
  let movableInstanceId: string;
  let canRun = true;
  let skipReason = "";

  const getLocationFromList = (items: Array<any>, id: string) => {
    return items.find((item) => item._id === id);
  };

  test.beforeAll(async ({ request }) => {
    const locationsRes = await request.get("locations?limit=50");
    expect(locationsRes.status()).toBe(200);
    const locationsBody = await locationsRes.json();
    const items = locationsBody.data.items as Array<any>;

    if (items.length === 0) {
      const includeInactiveRes = await request.get(
        "locations?limit=50&includeInactive=true",
      );
      expect(includeInactiveRes.status()).toBe(200);
      const includeInactiveBody = await includeInactiveRes.json();
      const includeInactiveItems = includeInactiveBody.data.items as Array<any>;

      if (includeInactiveItems.length > 0) {
        const candidate = includeInactiveItems[0]!;
        if (candidate.isActive === false) {
          const restoreRes = await request.post(
            `locations/${candidate._id}/restore`,
          );
          expect(restoreRes.status()).toBe(200);
        }
        items.push(candidate);
      }
    }

    if (items.length === 0) {
      const meRes = await request.get("auth/me");
      expect(meRes.status()).toBe(200);
      const meBody = await meRes.json();
      const currentUserId = meBody.data.user._id ?? meBody.data.user.id;

      const fallbackCreateRes = await request.post("locations", {
        data: {
          code: `LOC${Date.now().toString().slice(-7)}`,
          name: generateRandomName("Sede Ocupacion Base"),
          managerId: currentUserId,
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

      expect([201, 409]).toContain(fallbackCreateRes.status());
      if (fallbackCreateRes.status() === 409) {
        const retryRes = await request.get("locations?limit=50&includeInactive=true");
        expect(retryRes.status()).toBe(200);
        const retryBody = await retryRes.json();
        const retryItems = retryBody.data.items as Array<any>;
        if (retryItems.length > 0) {
          items.push(retryItems[0]);
        }
      } else {
        const fallbackCreateBody = await fallbackCreateRes.json();
        items.push(fallbackCreateBody.data);
      }
    }

    if (items.length === 0) {
      canRun = false;
      skipReason =
        "No hay sedes disponibles y no fue posible crear una sede base para la prueba";
      return;
    }

    primaryLocationId = items[0]!._id;
    secondaryLocationId = items.length > 1 ? items[1]!._id : null;

    const categoryRes = await request.post("materials/categories", {
      data: {
        name: generateRandomName("Ocupacion Categoria"),
        description: "Categoria para pruebas de ocupacion",
      },
    });
    expect(categoryRes.status()).toBe(201);
    const categoryBody = await categoryRes.json();
    const categoryId = categoryBody.data.category._id;

    const materialTypeRes = await request.post("materials/types", {
      data: {
        name: generateRandomName("Ocupacion Material"),
        categoryId: [categoryId],
        description: "Tipo para pruebas de ocupacion",
        pricePerDay: 100,
      },
    });
    expect(materialTypeRes.status()).toBe(201);
    const materialTypeBody = await materialTypeRes.json();
    materialTypeId = materialTypeBody.data.materialType._id;
  });

  test("GET /locations y GET /locations/:id deben reportar occupied consistente", async ({
    request,
  }) => {
    test.skip(!canRun, skipReason);

    const createRes = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: generateRandomSerial("OCC-LIST-DETAIL"),
        locationId: primaryLocationId,
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    movableInstanceId = createBody.data.instance._id;

    const [listRes, detailRes] = await Promise.all([
      request.get("locations?limit=100"),
      request.get(`locations/${primaryLocationId}`),
    ]);

    expect(listRes.status()).toBe(200);
    expect(detailRes.status()).toBe(200);

    const listBody = await listRes.json();
    const detailBody = await detailRes.json();

    const listed = getLocationFromList(listBody.data.items, primaryLocationId);
    expect(listed).toBeDefined();

    expect(typeof listed.occupied).toBe("number");
    expect(typeof detailBody.data.occupied).toBe("number");
    expect(listed.occupied).toBe(detailBody.data.occupied);
    expect(detailBody.data.occupied).toBeGreaterThan(0);

    expect(detailBody.data.occupancySummary.occupied).toBe(
      detailBody.data.occupied,
    );
    expect(listed.occupancySummary.occupied).toBe(listed.occupied);
  });

  test("Movimiento entre sedes debe ajustar occupied en origen y destino", async ({
    request,
  }) => {
    test.skip(!canRun, skipReason);
    test.skip(!secondaryLocationId, "Se requieren al menos dos sedes activas");

    const beforeListRes = await request.get("locations?limit=100");
    expect(beforeListRes.status()).toBe(200);
    const beforeListBody = await beforeListRes.json();

    const beforeOrigin = getLocationFromList(
      beforeListBody.data.items,
      primaryLocationId,
    );
    const beforeDestination = getLocationFromList(
      beforeListBody.data.items,
      secondaryLocationId!,
    );

    expect(beforeOrigin).toBeDefined();
    expect(beforeDestination).toBeDefined();

    const moveRes = await request.patch(`materials/instances/${movableInstanceId}`, {
      data: {
        locationId: secondaryLocationId,
      },
    });
    expect(moveRes.status()).toBe(200);

    const afterListRes = await request.get("locations?limit=100");
    expect(afterListRes.status()).toBe(200);
    const afterListBody = await afterListRes.json();

    const afterOrigin = getLocationFromList(
      afterListBody.data.items,
      primaryLocationId,
    );
    const afterDestination = getLocationFromList(
      afterListBody.data.items,
      secondaryLocationId!,
    );

    expect(afterOrigin.occupied).toBe(beforeOrigin.occupied - 1);
    expect(afterDestination.occupied).toBe(beforeDestination.occupied + 1);
  });

  test("Creacion y retiro/eliminacion de items debe mantener occupied correcto", async ({
    request,
  }) => {
    test.skip(!canRun, skipReason);

    const targetLocationId = secondaryLocationId ?? primaryLocationId;

    const beforeRes = await request.get(`locations/${targetLocationId}`);
    expect(beforeRes.status()).toBe(200);
    const beforeBody = await beforeRes.json();
    const occupiedBefore = beforeBody.data.occupied as number;

    const createRetiredRes = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: generateRandomSerial("OCC-RETIRE"),
        locationId: targetLocationId,
      },
    });
    expect(createRetiredRes.status()).toBe(201);
    const createRetiredBody = await createRetiredRes.json();
    const retiredInstanceId = createRetiredBody.data.instance._id;

    const createDeleteRes = await request.post("materials/instances", {
      data: {
        modelId: materialTypeId,
        serialNumber: generateRandomSerial("OCC-DELETE"),
        locationId: targetLocationId,
      },
    });
    expect(createDeleteRes.status()).toBe(201);
    const createDeleteBody = await createDeleteRes.json();
    const deleteInstanceId = createDeleteBody.data.instance._id;

    const afterCreateRes = await request.get(`locations/${targetLocationId}`);
    expect(afterCreateRes.status()).toBe(200);
    const afterCreateBody = await afterCreateRes.json();
    expect(afterCreateBody.data.occupied).toBe(occupiedBefore + 2);

    const retireRes = await request.patch(
      `materials/instances/${retiredInstanceId}/status`,
      {
        data: {
          status: "retired",
          notes: "Retiro para prueba de ocupacion",
        },
      },
    );
    expect(retireRes.status()).toBe(200);

    const deleteRes = await request.delete(`materials/instances/${deleteInstanceId}`);
    expect(deleteRes.status()).toBe(204);

    const afterAdjustmentsRes = await request.get(`locations/${targetLocationId}`);
    expect(afterAdjustmentsRes.status()).toBe(200);
    const afterAdjustmentsBody = await afterAdjustmentsRes.json();

    expect(afterAdjustmentsBody.data.occupied).toBe(occupiedBefore);
    expect(afterAdjustmentsBody.data.occupancySummary.occupied).toBe(
      occupiedBefore,
    );
  });
});
