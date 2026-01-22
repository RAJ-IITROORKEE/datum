import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // Get the Svix headers for verification
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  // Handle the webhook
  const eventType = evt.type;

  if (eventType === "user.created") {
    const { id, email_addresses, first_name, last_name, phone_numbers } = evt.data;

    try {
      // Extract the primary email
      const primaryEmail = email_addresses.find(
        (email) => email.id === evt.data.primary_email_address_id
      );

      // Extract the primary phone
      const primaryPhone = phone_numbers?.find(
        (phone) => phone.id === evt.data.primary_phone_number_id
      );

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { clerkId: id },
      });

      if (!existingUser) {
        // Create user in database
        await prisma.user.create({
          data: {
            clerkId: id,
            email: primaryEmail?.email_address || "",
            name: first_name && last_name 
              ? `${first_name} ${last_name}` 
              : first_name || last_name || "User",
            phone: primaryPhone?.phone_number || null,
            isLoggedIn: true,
          },
        });

        console.log(`✅ User created in database: ${id}`);
      } else {
        console.log(`ℹ️ User already exists: ${id}`);
      }

      return NextResponse.json({
        success: true,
        message: "User created successfully",
      });
    } catch (error) {
      console.error("Error creating user in database:", error);
      return NextResponse.json(
        { error: "Failed to create user in database" },
        { status: 500 }
      );
    }
  }

  if (eventType === "user.updated") {
    const { id, email_addresses, first_name, last_name, phone_numbers } = evt.data;

    try {
      const primaryEmail = email_addresses.find(
        (email) => email.id === evt.data.primary_email_address_id
      );

      const primaryPhone = phone_numbers?.find(
        (phone) => phone.id === evt.data.primary_phone_number_id
      );

      // Update user in database
      await prisma.user.update({
        where: { clerkId: id },
        data: {
          email: primaryEmail?.email_address || undefined,
          name: first_name && last_name 
            ? `${first_name} ${last_name}` 
            : first_name || last_name || undefined,
          phone: primaryPhone?.phone_number || null,
        },
      });

      console.log(`✅ User updated in database: ${id}`);

      return NextResponse.json({
        success: true,
        message: "User updated successfully",
      });
    } catch (error) {
      console.error("Error updating user in database:", error);
      return NextResponse.json(
        { error: "Failed to update user in database" },
        { status: 500 }
      );
    }
  }

  if (eventType === "user.deleted") {
    const { id } = evt.data;

    try {
      // Delete user from database
      await prisma.user.delete({
        where: { clerkId: id || undefined },
      });

      console.log(`✅ User deleted from database: ${id}`);

      return NextResponse.json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting user from database:", error);
      return NextResponse.json(
        { error: "Failed to delete user from database" },
        { status: 500 }
      );
    }
  }

  if (eventType === "session.created") {
    const { user_id } = evt.data;

    try {
      // Update user login status
      await prisma.user.update({
        where: { clerkId: user_id },
        data: { isLoggedIn: true },
      });

      console.log(`✅ User logged in: ${user_id}`);
    } catch (error) {
      console.error("Error updating login status:", error);
    }
  }

  if (eventType === "session.ended") {
    const { user_id } = evt.data;

    try {
      // Update user logout status
      await prisma.user.update({
        where: { clerkId: user_id },
        data: { isLoggedIn: false },
      });

      console.log(`✅ User logged out: ${user_id}`);
    } catch (error) {
      console.error("Error updating logout status:", error);
    }
  }

  return NextResponse.json({ success: true });
}
