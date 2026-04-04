import type { PaperVersion, PaperBuild } from '../shared/ipc-types'

const GRAPHQL_URL = 'https://fill.papermc.io/graphql'

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  if (!res.ok) throw new Error(`PaperMC API error: HTTP ${res.status}`)
  const json = (await res.json()) as { data: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}

export async function getPaperVersions(): Promise<PaperVersion[]> {
  const data = await gql<{
    project: {
      versions: {
        nodes: {
          key: string
          support: { status: string }
          builds: { nodes: { number: number; channel: string; downloads: { name: string; size: number }[] }[] }
        }[]
      }
    }
  }>(`{
    project(key: "paper") {
      versions(first: 100) {
        nodes {
          key
          support { status }
          builds(last: 1) { nodes { number channel downloads { name size } } }
        }
      }
    }
  }`)

  return data.project.versions.nodes
    .map((v) => {
      const b = v.builds.nodes[0]
      const dl = b?.downloads.find((d) => !d.name.includes('mojang')) ?? b?.downloads[0]
      return {
        key:     v.key,
        support: { status: v.support.status as PaperVersion['support']['status'] },
        channel: b?.channel ?? 'DEFAULT',
        build:   b?.number ?? 0,
        size:    dl?.size ?? 0,
      }
    })
    .reverse()
}

export async function getLatestBuild(version: string): Promise<PaperBuild> {
  const data = await gql<{
    project: {
      version: {
        family: { java: { flags: { recommended: string[] } } }
        builds: {
          nodes: {
            number: number
            channel: string
            createdAt: string
            downloads: { name: string; url: string; size: number; checksums: { sha256: string } }[]
          }[]
        }
      }
    }
  }>(`{
    project(key: "paper") {
      version(key: "${version}") {
        family {
          java { flags { recommended } }
        }
        builds(last: 1) {
          nodes {
            number channel createdAt
            downloads { name url size checksums { sha256 } }
          }
        }
      }
    }
  }`)

  const v     = data.project.version
  const build = v.builds.nodes[0]
  if (!build) throw new Error(`No builds found for Paper ${version}`)

  const dl = build.downloads.find((d) => !d.name.includes('mojang')) ?? build.downloads[0]

  return {
    number:    build.number,
    channel:   build.channel,
    createdAt: build.createdAt,
    download: { name: dl.name, url: dl.url, size: dl.size, sha256: dl.checksums.sha256 },
    javaFlags: v.family.java.flags.recommended
  }
}
