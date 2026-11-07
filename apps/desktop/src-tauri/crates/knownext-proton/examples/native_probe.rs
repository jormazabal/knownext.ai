fn main() {
    let path = std::env::args_os()
        .nth(1)
        .expect("absolute bridge library path");
    let state = std::env::args_os().nth(2).expect("private state directory");
    let service = knownext_proton::Service::new(state.into(), path.into());
    let status = service.status().expect("redacted status");
    assert_eq!(status["available"], true, "native bridge did not load");
    // Only bridge.info was called, not authentication or a provider request.
    println!("{}", status);
}
