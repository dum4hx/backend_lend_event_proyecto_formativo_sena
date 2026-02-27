import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";

import { LocationService } from "./location.service.ts";
import { LocationZodSchema } from "./models/location_model.ts";
import {
  validateBody,
  validateQuery,
  paginationSchema,
} from "../../middleware/validation.ts";
import {
  authenticate,
  requireActiveOrganization,
  requirePermission,
  getOrgId,
} from "../../middleware/auth.ts";

/**
 * ============================================================================
 * LOCATION ROUTER
 * ============================================================================
 * 
 * Defines HTTP endpoints for physical location management.
 * 
 * Available endpoints:
 * - GET    /api/v1/locations       - List locations with pagination
 * - GET    /api/v1/locations/:id   - Get a location by ID
 * - POST   /api/v1/locations       - Create a new location
 * - PATCH  /api/v1/locations/:id   - Update a location
 * - DELETE /api/v1/locations/:id   - (DISABLED) Delete a location
 * 
 * Applied middleware:
 * - authenticate: Verifies JWT in httpOnly cookie
 * - requireActiveOrganization: Validates active organization in session
 * - requirePermission: Checks specific RBAC permissions
 * - validateBody/validateQuery: Validates input data with Zod
 * 
 * Features:
 * - Automatic multi-tenancy via getOrgId(req)
 * - Structured responses (status, message, data)
 * - Centralized error handling with next(error)
 * ============================================================================
 */

const locationRouter = Router();

// ============================================================================
// GLOBAL MIDDLEWARE
// ============================================================================

/**
 * Apply authentication and active organization verification to all routes
 * Important order: first authenticate, then requireActiveOrganization
 */
locationRouter.use(authenticate, requireActiveOrganization);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Validation schema for listing query params
 * Extends base pagination schema with specific filters
 */
const listLocationsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),  // Free text search
  city: z.string().optional(),    // City filter
});

/**
 * Schemas for body validation in POST/PATCH
 * - createLocationSchema: All required fields
 * - updateLocationSchema: All optional fields (partial update)
 */
const createLocationSchema = LocationZodSchema;
const updateLocationSchema = LocationZodSchema.partial();

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/locations
 * Lists all locations in the organization with pagination and filters
 * 
 * Query Params:
 * - page: page number (default: 1)
 * - limit: items per page (default: 20)
 * - search: search in name/city/street
 * - city: exact city filter
 * 
 * Permissions: locations:read
 * 
 * Response 200:
 * {
 *   status: "success",
 *   message: "Locations fetched successfully",
 *   data: {
 *     items: Location[],
 *     pagination: { page, limit, total, totalPages }
 *   }
 * }
 */
locationRouter.get(
  "/",
  requirePermission("locations:read"),
  validateQuery(listLocationsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get organizationId from authenticated request and convert to string
      const organizationId = getOrgId(req).toString();
      
      // Extract and type query params
      const query = req.query as {
        page?: string;
        limit?: string;
        search?: string;
        city?: string;
      };

      // Parse pagination parameters with default values
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const { search, city } = query;

      // Call service with all parameters
      const result = await LocationService.listLocations({
        organizationId,
        page,
        limit,
        ...(search && { search }),
        ...(city && { city }),
      });

      // Successful response with standard structure
      res.status(200).json({
        status: "success",
        message: "Locations fetched successfully",
        data: result,
      });
    } catch (error) {
      // Delegate error handling to global middleware
      next(error);
    }
  },
);

/**
 * GET /api/v1/locations/:id
 * Gets a specific location by its ID
 * 
 * Path Params:
 * - id: MongoDB ObjectId of the location
 * 
 * Permissions: locations:read
 * 
 * Response 200:
 * {
 *   status: "success",
 *   message: "Location fetched successfully",
 *   data: Location
 * }
 * 
 * Errors:
 * - 400: Invalid ID
 * - 404: Location not found or doesn't belong to organization
 */
locationRouter.get(
  "/:id",
  requirePermission("locations:read"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract ID from path with type assertion (Express ensures it's a string)
      const id = req.params.id as string;
      const organizationId = getOrgId(req).toString();

      // Search location with organization scope
      const location = await LocationService.getLocationById(
        id,
        organizationId,
      );

      // Successful response
      res.status(200).json({
        status: "success",
        message: "Location fetched successfully",
        data: location,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/locations
 * Creates a new location in the organization
 * 
 * Body (JSON):
 * {
 *   name: string,
 *   address: {
 *     country: string,
 *     state?: string,
 *     city: string,
 *     street: string,
 *     propertyNumber: string,
 *     additionalInfo?: string
 *   }
 * }
 * 
 * Permissions: locations:create
 * 
 * Response 201:
 * {
 *   status: "success",
 *   message: "Location created successfully",
 *   data: Location
 * }
 * 
 * Errors:
 * - 400: Invalid data (Zod validation)
 * - 409: Duplicate name in organization
 */
locationRouter.post(
  "/",
  requirePermission("locations:create"),
  validateBody(createLocationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get organizationId as ObjectId (service accepts both types)
      const organizationId = getOrgId(req);

      // Create location with body data + organizationId
      const location = await LocationService.createLocation({
        ...req.body,
        organizationId,
      });

      // Response with 201 Created code
      res.status(201).json({
        status: "success",
        message: "Location created successfully",
        data: location,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/v1/locations/:id
 * Updates an existing location (partial update)
 * 
 * Path Params:
 * - id: MongoDB ObjectId of the location
 * 
 * Body (JSON): Any subset of Location fields
 * Example:
 * {
 *   "address": {
 *     "additionalInfo": "Floor 3"
 *   }
 * }
 * 
 * Permissions: locations:update
 * 
 * Response 200:
 * {
 *   status: "success",
 *   message: "Location updated successfully",
 *   data: Location
 * }
 * 
 * Errors:
 * - 400: Invalid ID or invalid data
 * - 404: Location not found
 */
locationRouter.patch(
  "/:id",
  requirePermission("locations:update"),
  validateBody(updateLocationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const organizationId = getOrgId(req).toString();

      // Update only fields sent in body
      const location = await LocationService.updateLocation(
        id,
        organizationId,
        req.body,
      );

      res.status(200).json({
        status: "success",
        message: "Location updated successfully",
        data: location,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/locations/:id
 * Deletes a location (ENDPOINT DISABLED)
 * 
 * ⚠️ IMPORTANT: This endpoint is commented out for data integrity reasons
 * 
 * Reasons to disable DELETE:
 * 1. Locations are related to:
 *    - MaterialInstance (physical inventory)
 *    - User assignments
 *    - Movement and loan history
 * 
 * 2. Deleting a location would cause:
 *    - Loss of inventory traceability
 *    - Orphaned references in material instances
 *    - Inconsistencies in historical reports
 * 
 * RECOMMENDED ALTERNATIVES:
 * - Implement "isActive: boolean" field for logical deactivation
 * - Create endpoint PATCH /locations/:id/toggle-status
 * - Maintain referential integrity with soft deletes
 * 
 * If you need to enable physical deletion:
 * 1. Implement cascade delete in all related entities
 * 2. Add explicit user confirmation
 * 3. Create backup/audit log before deletion
 */
/*
locationRouter.delete(
  "/:id",
  requirePermission("locations:delete"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const organizationId = getOrgId(req).toString();

      await LocationService.deleteLocation(id, organizationId);

      res.status(200).json({
        status: "success",
        message: "Location deleted successfully",
        data: null,
      });
    } catch (error) {
      next(error);
    }
  },
);
*/

export default locationRouter;