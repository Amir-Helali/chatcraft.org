import { useCallback, type RefObject } from "react";
import {
  Avatar,
  Box,
  ButtonGroup,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Link,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
  useColorMode,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react";
import { BiSun, BiMoon } from "react-icons/bi";
import { BsGithub } from "react-icons/bs";
import { TbSearch, TbLayoutSidebarLeftExpand, TbLayoutSidebarRightExpand } from "react-icons/tb";
import { Form } from "react-router-dom";

import PreferencesModal from "./PreferencesModal";
import { useUser } from "../hooks/use-user";

type HeaderProps = {
  chatId?: string;
  inputPromptRef: RefObject<HTMLTextAreaElement>;
  searchText?: string;
  isSidebarVisible: boolean;
  onSidebarVisibleClick: () => void;
};

function Header({
  chatId,
  inputPromptRef,
  searchText,
  isSidebarVisible,
  onSidebarVisibleClick,
}: HeaderProps) {
  const { toggleColorMode } = useColorMode();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { user, login, logout } = useUser();

  const handleLoginLogout = useCallback(() => {
    if (user) {
      logout(chatId);
    } else {
      login(chatId);
    }
  }, [chatId, user, login, logout]);

  return (
    <Flex
      w="100%"
      bg={useColorModeValue("white", "gray.700")}
      justify="space-between"
      align="center"
      borderBottom="2px"
      borderColor={useColorModeValue("gray.50", "gray.600")}
    >
      <HStack>
        <IconButton
          icon={isSidebarVisible ? <TbLayoutSidebarRightExpand /> : <TbLayoutSidebarLeftExpand />}
          variant="ghost"
          aria-label="Toggle Sidebar Menu"
          onClick={() => onSidebarVisibleClick()}
        />
        <Text fontWeight="bold" color={useColorModeValue("blue.600", "blue.200")}>
          <Link
            href="/"
            _hover={{ textDecoration: "none", color: useColorModeValue("blue.400", "blue.100") }}
          >
            &lt;ChatCraft /&gt;
          </Link>
        </Text>
      </HStack>

      <Box flex={1} maxW="500px" px={4}>
        <Form action="/s" method="get">
          <InputGroup size="sm" variant="outline">
            <Input type="search" name="q" defaultValue={searchText} isRequired />
            <IconButton aria-label="Search" variant="ghost" icon={<TbSearch />} type="submit" />
          </InputGroup>
        </Form>
      </Box>

      <ButtonGroup isAttached pr={2} alignItems="center">
        <IconButton
          aria-label={useColorModeValue("Switch to Dark Mode", "Switch to Light Mode")}
          title={useColorModeValue("Switch to Dark Mode", "Switch to Light Mode")}
          icon={useColorModeValue(<BiMoon />, <BiSun />)}
          variant="ghost"
          onClick={toggleColorMode}
        />

        <Box>
          <Menu>
            <MenuButton
              as={IconButton}
              aria-label="User Settings"
              title="User Settings"
              icon={
                user ? (
                  <Avatar size="xs" src={user.avatarUrl} title={user.username} />
                ) : (
                  <Avatar
                    size="xs"
                    bg="gray.500"
                    borderColor="gray.400"
                    _dark={{ bg: "gray.600", borderColor: "gray.500" }}
                    showBorder
                  />
                )
              }
              variant="ghost"
            />
            <MenuList>
              <MenuItem onClick={onOpen}>Settings...</MenuItem>
              <MenuItem onClick={handleLoginLogout}>
                {user ? (
                  "Logout"
                ) : (
                  <>
                    <BsGithub /> <Text ml={2}>Sign in with GitHub</Text>
                  </>
                )}
              </MenuItem>
              <MenuDivider />
              <MenuItem
                as="a"
                href="https://github.com/tarasglek/chatcraft.org"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub Repository"
                title="GitHub Repository"
              >
                GitHub Repository
              </MenuItem>
            </MenuList>
          </Menu>
        </Box>

        <PreferencesModal isOpen={isOpen} onClose={onClose} finalFocusRef={inputPromptRef} />
      </ButtonGroup>
    </Flex>
  );
}

export default Header;
