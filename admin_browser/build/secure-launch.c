// Defence in depth for HA Supervisor's seccomp=unconfined containers.
// This targeted deny-list complements AppArmor and Firefox's content sandbox;
// it is not a general-purpose replacement for Docker's default allow-list.
#include <seccomp.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  if (argc < 2) return 64;
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) { perror("no_new_privs"); return 70; }
  scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_ALLOW);
  if (!ctx) return 70;
  const char *blocked[] = {
    "add_key", "request_key", "keyctl", "bpf", "perf_event_open", "userfaultfd",
    "init_module", "finit_module", "delete_module", "kexec_load", "kexec_file_load",
    "reboot", "swapon", "swapoff", "syslog", "iopl", "ioperm", "acct",
    "open_by_handle_at",
    "io_uring_setup", "io_uring_register", "io_uring_enter",
    "quotactl", "quotactl_fd", "lookup_dcookie", "kcmp", NULL
  };
  // Keep user-namespace creation and namespace-local mount operations usable:
  // the browser/file picker creates its own isolation with them. No SYS_ADMIN
  // capability is requested, so this does not permit mounting on the host.
  // Likewise leave ordinary same-user IPC/debug calls to kernel access checks.
  for (int i=0; blocked[i]; i++) {
    int nr=seccomp_syscall_resolve_name(blocked[i]);
    if (nr == __NR_SCMP_ERROR) continue; // absent on this architecture/libseccomp
    if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), nr, 0)) goto fail;
  }
  if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(socket), 1,
      SCMP_A0(SCMP_CMP_EQ, AF_PACKET))) goto fail;
  // AF_NETLINK/SOCK_RAW is used for normal interface discovery by GTK/Firefox.
  // Block raw IP traffic, not unrelated socket families with the same type.
  if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(socket), 2,
      SCMP_A0(SCMP_CMP_EQ, AF_INET),
      SCMP_A1(SCMP_CMP_MASKED_EQ, 0xf, SOCK_RAW))) goto fail;
  if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(socket), 2,
      SCMP_A0(SCMP_CMP_EQ, AF_INET6),
      SCMP_A1(SCMP_CMP_MASKED_EQ, 0xf, SOCK_RAW))) goto fail;
  if (seccomp_load(ctx)) goto fail;
  seccomp_release(ctx);
  if (!strcmp(argv[1], "--self-test")) {
    errno=0;
    int fd=socket(AF_PACKET, SOCK_DGRAM, 0);
    if(fd>=0) { close(fd); return 71; }
    if(errno!=EPERM || prctl(PR_GET_NO_NEW_PRIVS,0,0,0,0)!=1 ||
       prctl(PR_GET_SECCOMP,0,0,0,0)!=2) return 71;
    puts("PASS: seccomp filter active, no-new-privileges active, packet socket denied");
    return 0;
  }
  execvp(argv[1], &argv[1]); perror("exec"); return 70;
fail:
  fputs("CFM: required security filter could not be installed; refusing startup.\n", stderr);
  seccomp_release(ctx); return 70;
}
