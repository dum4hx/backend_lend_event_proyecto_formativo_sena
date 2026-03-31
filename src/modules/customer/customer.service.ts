import { Types } from "mongoose";
import { Customer, type CustomerDocument } from "./models/customer.model.ts";
import { Loan } from "../loan/models/loan.model.ts";
import { AppError } from "../../errors/AppError.ts";

interface ListCustomersQuery {
  page?: number;
  limit?: number;
  status?: string | undefined;
  search?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: "asc" | "desc" | undefined;
}

export const customerService = {
  /**
   * Lists customers for an organization with pagination, search, and filtering.
   */
  async listCustomers(
    organizationId: Types.ObjectId,
    query: ListCustomersQuery,
  ) {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { organizationId };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { "name.firstName": { $regex: search, $options: "i" } },
        { "name.firstSurname": { $regex: search, $options: "i" } },
        { documentNumber: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ [sortBy]: sortDirection }),
      Customer.countDocuments(filter),
    ]);

    return {
      customers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Gets a single customer by ID within the organization.
   */
  async getCustomerById(customerId: string, organizationId: Types.ObjectId) {
    const customer = await Customer.findOne({
      _id: customerId,
      organizationId,
    });

    if (!customer) {
      throw AppError.notFound("Customer not found");
    }

    return customer;
  },

  /**
   * Creates a new customer in the organization.
   */
  async createCustomer(
    organizationId: Types.ObjectId,
    data: Record<string, unknown>,
  ) {
    // Check for duplicate email
    const existingEmail = await Customer.findOne({
      organizationId,
      email: (data.email as string).toLowerCase(),
    });

    if (existingEmail) {
      throw AppError.conflict("A customer with this email already exists");
    }

    // Check for duplicate phone within the organization
    const existingPhone = await Customer.findOne({
      organizationId,
      phone: data.phone as string,
    });

    if (existingPhone) {
      throw AppError.conflict(
        "A customer with this phone number already exists in this organization",
      );
    }

    const customer = await Customer.create({
      ...data,
      organizationId,
    });

    return customer;
  },

  /**
   * Updates a customer's information.
   */
  async updateCustomer(
    customerId: string,
    organizationId: Types.ObjectId,
    data: Record<string, unknown>,
  ) {
    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, organizationId },
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!customer) {
      throw AppError.notFound("Customer not found");
    }

    return customer;
  },

  /**
   * Changes a customer's status (activate, deactivate, blacklist).
   */
  async changeStatus(
    customerId: string,
    organizationId: Types.ObjectId,
    newStatus: "active" | "inactive" | "blacklisted",
  ) {
    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, organizationId },
      { $set: { status: newStatus } },
      { new: true },
    );

    if (!customer) {
      throw AppError.notFound("Customer not found");
    }

    return customer;
  },

  /**
   * Soft-deletes a customer by setting status to inactive.
   * Blocks deletion if customer has active loans.
   */
  async deleteCustomer(customerId: string, organizationId: Types.ObjectId) {
    // Check for active loans
    const activeLoans = await Loan.countDocuments({
      customerId,
      organizationId,
      status: { $in: ["active", "overdue"] },
    });

    if (activeLoans > 0) {
      throw AppError.badRequest("Cannot delete customer with active loans", {
        activeLoansCount: activeLoans,
      });
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, organizationId },
      { $set: { status: "inactive" } },
      { new: true },
    );

    if (!customer) {
      throw AppError.notFound("Customer not found");
    }

    return customer;
  },
};
