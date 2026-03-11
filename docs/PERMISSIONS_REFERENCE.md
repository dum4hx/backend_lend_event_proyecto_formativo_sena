# Permissions Reference

Generated at: 2026-03-08T21:18:03.050Z

Total permissions: 52

This document is generated from the MongoDB `permissions` collection.
Each section explains the purpose of a permission and the action it allows.

## Index

- [`analytics:read`](#analyticsread)
- [`billing:manage`](#billingmanage)
- [`customers:create`](#customerscreate)
- [`customers:delete`](#customersdelete)
- [`customers:read`](#customersread)
- [`customers:update`](#customersupdate)
- [`inspections:create`](#inspectionscreate)
- [`inspections:read`](#inspectionsread)
- [`inspections:update`](#inspectionsupdate)
- [`invoices:create`](#invoicescreate)
- [`invoices:read`](#invoicesread)
- [`invoices:update`](#invoicesupdate)
- [`loans:checkout`](#loanscheckout)
- [`loans:create`](#loanscreate)
- [`loans:read`](#loansread)
- [`loans:return`](#loansreturn)
- [`loans:update`](#loansupdate)
- [`material_attributes:create`](#material_attributescreate)
- [`material_attributes:delete`](#material_attributesdelete)
- [`material_attributes:read`](#material_attributesread)
- [`material_attributes:update`](#material_attributesupdate)
- [`materials:create`](#materialscreate)
- [`materials:delete`](#materialsdelete)
- [`materials:read`](#materialsread)
- [`materials:update`](#materialsupdate)
- [`organization:delete`](#organizationdelete)
- [`organization:read`](#organizationread)
- [`organization:update`](#organizationupdate)
- [`packages:create`](#packagescreate)
- [`packages:delete`](#packagesdelete)
- [`packages:read`](#packagesread)
- [`packages:update`](#packagesupdate)
- [`permissions:create`](#permissionscreate)
- [`permissions:delete`](#permissionsdelete)
- [`permissions:read`](#permissionsread)
- [`permissions:update`](#permissionsupdate)
- [`platform:manage`](#platformmanage)
- [`reports:read`](#reportsread)
- [`requests:approve`](#requestsapprove)
- [`requests:create`](#requestscreate)
- [`requests:delete`](#requestsdelete)
- [`requests:read`](#requestsread)
- [`requests:update`](#requestsupdate)
- [`roles:create`](#rolescreate)
- [`roles:delete`](#rolesdelete)
- [`roles:read`](#rolesread)
- [`roles:update`](#rolesupdate)
- [`subscription:manage`](#subscriptionmanage)
- [`subscription_types:create`](#subscription_typescreate)
- [`subscription_types:delete`](#subscription_typesdelete)
- [`subscription_types:read`](#subscription_typesread)
- [`subscription_types:update`](#subscription_typesupdate)
- [`users:create`](#userscreate)
- [`users:delete`](#usersdelete)
- [`users:read`](#usersread)
- [`users:update`](#usersupdate)

## Permission Details

### `analytics:read`

- **Display Name:** View Analytics
- **Category:** Analytics
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows access to data dashboards and performance metrics.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Analytics

### `billing:manage`

- **Display Name:** Manage Billing
- **Category:** Billing
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows management of payment methods and viewing billing history.
- **Allowed Action:** Perform administrative/management operations for this resource.
- **Resource Target:** Billing

### `customers:create`

- **Display Name:** Create Customers
- **Category:** Customers
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows registering new customers/clients in the system.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Customers

### `customers:delete`

- **Display Name:** Delete Customers
- **Category:** Customers
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows removing customer records from the system.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Customers

### `customers:read`

- **Display Name:** View Customers
- **Category:** Customers
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing customer directories and history.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Customers

### `customers:update`

- **Display Name:** Update Customers
- **Category:** Customers
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows editing customer contact information and details.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Customers

### `inspections:create`

- **Display Name:** Create Inspections
- **Category:** Inspections
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows performing and recording item inspections.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Inspections

### `inspections:read`

- **Display Name:** View Inspections
- **Category:** Inspections
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing inspection logs and results.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Inspections

### `inspections:update`

- **Display Name:** Update Inspections
- **Category:** Inspections
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows editing existing inspection reports.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Inspections

### `invoices:create`

- **Display Name:** Create Invoices
- **Category:** Invoices
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows generating new invoices for customers.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Invoices

### `invoices:read`

- **Display Name:** View Invoices
- **Category:** Invoices
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing invoice history and payment status.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Invoices

### `invoices:update`

- **Display Name:** Update Invoices
- **Category:** Invoices
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows modifying draft or existing invoices.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Invoices

### `loans:checkout`

- **Display Name:** Checkout Loans
- **Category:** Loans
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows processing the physical checkout of loaned items.
- **Allowed Action:** Mark items in this resource as checked out.
- **Resource Target:** Loans

### `loans:create`

- **Display Name:** Create Loans
- **Category:** Loans
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows initiating new material loan records.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Loans

### `loans:read`

- **Display Name:** View Loans
- **Category:** Loans
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing active and historical loan records.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Loans

### `loans:return`

- **Display Name:** Return Loans
- **Category:** Loans
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows processing the return and check-in of loaned items.
- **Allowed Action:** Process returns and close checkouts for this resource.
- **Resource Target:** Loans

### `loans:update`

- **Display Name:** Update Loans
- **Category:** Loans
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows editing loan terms and information.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Loans

### `materials:create`

- **Display Name:** Create Materials
- **Category:** Materials
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows adding new materials or inventory items.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Materials

### `materials:delete`

- **Display Name:** Delete Materials
- **Category:** Materials
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows removing materials from the catalog.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Materials

### `materials:read`

- **Display Name:** View Materials
- **Category:** Materials
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows browsing the inventory and material catalog.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Materials

### `material_attributes:create`

- **Display Name:** Create Material Attributes
- **Category:** Materials
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows defining new configurable attributes for material types within the organization.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Material Attributes

### `material_attributes:delete`

- **Display Name:** Delete Material Attributes
- **Category:** Materials
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows permanently removing attribute definitions that are not currently assigned to any material type.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Material Attributes

### `material_attributes:read`

- **Display Name:** View Material Attributes
- **Category:** Materials
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows listing and viewing configurable attribute definitions for material types.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Material Attributes

### `material_attributes:update`

- **Display Name:** Update Material Attributes
- **Category:** Materials
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows modifying attribute definitions (name, unit, allowed values, required flag).
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Material Attributes

### `materials:update`

- **Display Name:** Update Materials
- **Category:** Materials
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows editing material specifications and details.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Materials

### `organization:delete`

- **Display Name:** Delete Organization
- **Category:** Organization
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Allows the permanent removal of an organization and its data.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Organization

### `organization:read`

- **Display Name:** View Organization
- **Category:** Organization
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing organization profile and basic settings.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Organization

### `organization:update`

- **Display Name:** Update Organization
- **Category:** Organization
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows editing organization details, branding, and contact info.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Organization

### `packages:create`

- **Display Name:** Create Packages
- **Category:** Packages
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows creating new material bundles or packages.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Packages

### `packages:delete`

- **Display Name:** Delete Packages
- **Category:** Packages
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows removing package definitions.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Packages

### `packages:read`

- **Display Name:** View Packages
- **Category:** Packages
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing existing packages and their contents.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Packages

### `packages:update`

- **Display Name:** Update Packages
- **Category:** Packages
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows modifying package compositions and details.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Packages

### `permissions:create`

- **Display Name:** Create Permissions
- **Category:** Permissions
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Allows defining new granular permissions within the system.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Permissions

### `permissions:delete`

- **Display Name:** Delete Permissions
- **Category:** Permissions
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Allows removing permission definitions from the system.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Permissions

### `permissions:read`

- **Display Name:** View Permissions
- **Category:** Permissions
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows browsing the list of available system permissions.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Permissions

### `permissions:update`

- **Display Name:** Update Permissions
- **Category:** Permissions
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Allows editing the metadata or status of existing permissions.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Permissions

### `platform:manage`

- **Display Name:** Manage Platform
- **Category:** Platform
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Grant full administrative access to global platform settings and configurations.
- **Allowed Action:** Perform administrative/management operations for this resource.
- **Resource Target:** Platform

### `reports:read`

- **Display Name:** View Reports
- **Category:** Reports
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows access to generated business and operational reports.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Reports

### `requests:approve`

- **Display Name:** Approve Requests
- **Category:** Requests
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows authorizing or rejecting submitted requests.
- **Allowed Action:** Approve pending workflows for this resource.
- **Resource Target:** Requests

### `requests:create`

- **Display Name:** Create Requests
- **Category:** Requests
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows submitting new material or service requests.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Requests

### `requests:delete`

- **Display Name:** Delete Requests
- **Category:** Requests
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows canceling or removing request records.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Requests

### `requests:read`

- **Display Name:** View Requests
- **Category:** Requests
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing and tracking the status of requests.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Requests

### `requests:update`

- **Display Name:** Update Requests
- **Category:** Requests
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows editing pending request details.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Requests

### `roles:create`

- **Display Name:** Create Roles
- **Category:** Roles
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows defining custom roles and permission sets.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Roles

### `roles:delete`

- **Display Name:** Delete Roles
- **Category:** Roles
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows removing custom roles from the organization.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Roles

### `roles:read`

- **Display Name:** View Roles
- **Category:** Roles
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing defined system and organization roles.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Roles

### `roles:update`

- **Display Name:** Update Roles
- **Category:** Roles
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows editing role names and assigned permissions.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Roles

### `subscription:manage`

- **Display Name:** Manage Subscription
- **Category:** Subscription
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows upgrading, downgrading, or canceling the organization's plan.
- **Allowed Action:** Perform administrative/management operations for this resource.
- **Resource Target:** Subscription

### `subscription_types:create`

- **Display Name:** Create Subscription Types
- **Category:** Subscription_types
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Allows the creation of new subscription plan levels and pricing structures.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Subscription Types

### `subscription_types:delete`

- **Display Name:** Delete Subscription Types
- **Category:** Subscription_types
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Allows removing subscription plan definitions from the platform.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Subscription Types

### `subscription_types:read`

- **Display Name:** View Subscription Types
- **Category:** Subscription_types
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Allows viewing the available subscription plans and their configurations.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Subscription Types

### `subscription_types:update`

- **Display Name:** Update Subscription Types
- **Category:** Subscription_types
- **Scope:** Platform
- **Active:** Yes
- **Purpose:** Allows modifying existing subscription plan details and limits.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Subscription Types

### `users:create`

- **Display Name:** Create Users
- **Category:** Users
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows inviting and creating new user accounts within the organization.
- **Allowed Action:** Create new records in this resource.
- **Resource Target:** Users

### `users:delete`

- **Display Name:** Delete Users
- **Category:** Users
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows removing users from the organization.
- **Allowed Action:** Remove records from this resource.
- **Resource Target:** Users

### `users:read`

- **Display Name:** View Users
- **Category:** Users
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows viewing the list and profiles of organization members.
- **Allowed Action:** View/list records and details for this resource.
- **Resource Target:** Users

### `users:update`

- **Display Name:** Update Users
- **Category:** Users
- **Scope:** Organization
- **Active:** Yes
- **Purpose:** Allows editing user roles, profiles, and account status.
- **Allowed Action:** Modify existing records in this resource.
- **Resource Target:** Users
