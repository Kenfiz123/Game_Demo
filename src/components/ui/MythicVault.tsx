import Image from "next/image";

export const MYTHIC_VAULT_IMAGE = "/assets/mythic/vault.webp";

/** A sealed, static placeholder with no winning item identity or variant input. */
export function MythicVault() {
  return <div className="vault-art mythic-sealed-vault" aria-hidden="true">
    <Image src={MYTHIC_VAULT_IMAGE} alt="" width={256} height={256} sizes="110px"/>
  </div>;
}
