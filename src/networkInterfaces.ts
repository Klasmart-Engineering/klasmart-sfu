
import { networkInterfaces, NetworkInterfaceInfo } from "os";

export function getNetworkInterfaceInfo() {
    const results = [] as NetworkInterfaceInfo[];
    const interfaces = networkInterfaces();
    for (const deviceName in interfaces) {
        const addresses = interfaces[deviceName];
        if (!addresses) { continue; }
        results.push(...addresses);
    }
    return results;
}

export function getNetworkInterfacesAddresses() {
    return Object.values(networkInterfaces())
        .flatMap(
            bindings => bindings?.map(
                binding => binding.address
            ) ?? []
        );
}