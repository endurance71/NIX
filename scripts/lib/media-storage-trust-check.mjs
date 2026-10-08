/** The real HTTP adapter supplies a user JWT; tests inject only I/O. */
export async function verifyMediaStorageTrust(request, approve) {
  for (const [method, body] of [['POST', 'safe-original'], ['PUT', 'safe-replaced']]) {
    const result = await request(method, body);
    if (![200, 201].includes(result.status)) throw new Error(`Pending Storage ${method} failed: ${result.status}`);
  }
  await approve();
  const overwrite = await request('PUT', 'unsafe-change');
  if (overwrite.status < 400 || overwrite.status >= 500) throw new Error(`Approved object overwrite was not denied: ${overwrite.status}`);
  const unchanged = await request('GET');
  if (unchanged.status !== 200 || unchanged.body !== 'safe-replaced') {
    throw new Error('Approved Storage bytes changed after denied overwrite');
  }
}
