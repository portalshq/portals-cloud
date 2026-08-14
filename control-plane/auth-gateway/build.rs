fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto = "../../infra/lore/lore/lore-proto/proto/auth_api.proto";
    let rebac = "../../infra/lore/lore/lore-proto/proto/rebac_api.proto";
    let include = "../../infra/lore/lore/lore-proto/proto";
    println!("cargo:rerun-if-changed={proto}");
    println!("cargo:rerun-if-changed={rebac}");
    tonic_prost_build::configure()
        .build_client(false)
        .build_server(true)
        .protoc_arg("--experimental_allow_proto3_optional")
        .compile_protos(&[proto, rebac], &[include])?;
    Ok(())
}
