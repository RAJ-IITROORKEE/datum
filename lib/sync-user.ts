import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/**
 * Syncs the current Clerk user to the database
 * Creates a new user if they don't exist, updates if they do
 */
export async function syncUser() {
  try {
    // Get the current user from Clerk
    const clerkUser = await currentUser();

    if (!clerkUser) {
      return null;
    }

    // Check if user exists in database
    const existingUser = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
    });

    if (existingUser) {
      // User exists, update their login status
      const updatedUser = await prisma.user.update({
        where: { clerkId: clerkUser.id },
        data: {
          isLoggedIn: true,
        },
      });
      return updatedUser;
    }

    // User doesn't exist, create them
    const primaryEmail = clerkUser.emailAddresses.find(
      (email) => email.id === clerkUser.primaryEmailAddressId
    );

    const primaryPhone = clerkUser.phoneNumbers.find(
      (phone) => phone.id === clerkUser.primaryPhoneNumberId
    );

    const fullName =
      clerkUser.firstName && clerkUser.lastName
        ? `${clerkUser.firstName} ${clerkUser.lastName}`
        : clerkUser.firstName || clerkUser.lastName || "User";

    const newUser = await prisma.user.create({
      data: {
        clerkId: clerkUser.id,
        email: primaryEmail?.emailAddress || "",
        name: fullName,
        phone: primaryPhone?.phoneNumber || null,
        isLoggedIn: true,
      },
    });

    console.log(`✅ New user created: ${newUser.email}`);
    return newUser;
  } catch (error) {
    console.error("Error syncing user:", error);
    return null;
  }
}

/**
 * Marks a user as logged out in the database
 */
export async function markUserLoggedOut(clerkId: string) {
  try {
    const user = await prisma.user.update({
      where: { clerkId },
      data: {
        isLoggedIn: false,
      },
    });

    console.log(`✅ User marked as logged out: ${user.email}`);
    return user;
  } catch (error) {
    console.error("Error marking user as logged out:", error);
    return null;
  }
}
