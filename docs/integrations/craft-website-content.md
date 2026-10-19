---
title: Craft website content
description: Managing public website copy through Craft CMS.
---

# Craft website content

The public homepage supports a dedicated Craft CMS 5.11 backend. Set `CRAFT_CONTENT_URL` and `CRAFT_CONTENT_TOKEN` in the application's hosting configuration. Keep the token server-only; it must not use a `NEXT_PUBLIC_` prefix.

With neither setting configured, the application uses its checked-in website copy. When configured, the server requests published content from Craft and validates the project identifier, expected unique keys, required records and text values before rendering them through the existing React components. HTTPS is required in production, redirects are rejected, and a configured content failure is surfaced instead of silently presented as a successful CMS update.

Each website uses its own Craft installation and database. Application authentication, operational records, private files and background processing remain with their existing services. Icons, layouts, navigation and frontend assets remain code-owned. Content changes are available on the next server request.

## Managed content

The homepage headline and description, four workflow steps and six feature descriptions. Craft is a separate content service and does not replace Appwrite or introduce PostgreSQL into the application runtime.
